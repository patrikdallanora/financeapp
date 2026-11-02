import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const migration = await fs.readFile(new URL('../supabase/migrations/20261102133954_preservation_staging.sql', import.meta.url), 'utf8')
const owner = '11111111-1111-4111-8111-111111111111'
const outsider = '22222222-2222-4222-8222-222222222222'
const household = '33333333-3333-4333-8333-333333333333'
const otherHousehold = '44444444-4444-4444-8444-444444444444'

async function setup(t) {
  const pg = new PGlite()
  t.after(() => pg.close())
  // Supabase's auth schema and standard roles are supplied by the platform.
  await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    insert into auth.users values ('${owner}'), ('${outsider}');`)
  await pg.exec(migration)
  await pg.exec(`insert into public.financeapp_households(id,name) values ('${household}','Casa'), ('${otherHousehold}','Outra');
    insert into financeapp_private.memberships(household_id,user_id,role) values ('${household}','${owner}','owner');`)
  return pg
}

test('migração SQL nasce com sync desligado e RLS separa membro de outra base', async t => {
  const pg = await setup(t)
  assert.equal((await pg.query('select sync_enabled from public.financeapp_households limit 1')).rows[0].sync_enabled, false)
  await pg.exec(`set role authenticated; set request.jwt.claim.sub = '${owner}';`)
  assert.deepEqual((await pg.query('select id from public.financeapp_households')).rows, [{ id: household }])
  await assert.rejects(pg.exec("insert into public.financeapp_households(name) values ('Invadida')"), /permission denied/)
  await assert.rejects(pg.exec('update public.financeapp_households set sync_enabled = true'), /permission denied/)
  await pg.exec(`set request.jwt.claim.sub = '${outsider}';`)
  assert.equal((await pg.query('select * from public.financeapp_households')).rows.length, 0)
  await pg.exec('reset role; set role anon;')
  await assert.rejects(pg.query('select * from public.financeapp_households'), /permission denied/)
})

test('staging financeiro não pode ser lido nem alterado pelo cliente ou membro', async t => {
  const pg = await setup(t)
  await pg.exec(`set role authenticated; set request.jwt.claim.sub = '${owner}';`)
  for (const table of ['memberships', 'migration_runs', 'source_backups', 'source_records', 'reconciliation_issues']) {
    await assert.rejects(pg.query(`select * from financeapp_private.${table}`), /permission denied/)
  }
})

test('staging preserva UUID repetido, impede reimportação e impede cruzar bases', async t => {
  const pg = await setup(t)
  const run = (await pg.query(`insert into financeapp_private.migration_runs(household_id) values ($1) returning id`, [household])).rows[0].id
  const hash = 'a'.repeat(64)
  const backup = (await pg.query(`insert into financeapp_private.source_backups
    (household_id,migration_run_id,source_kind,source_id,sha256,manifest,envelope_text,captured_at)
    values ($1,$2,'iphone','device-a',$3,'{}','envelope',now()) returning id`, [household, run, hash])).rows[0].id
  await assert.rejects(pg.query(`insert into financeapp_private.source_backups
    (household_id,migration_run_id,source_kind,source_id,sha256,manifest,envelope_text,captured_at)
    values ($1,$2,'iphone','device-a',$3,'{}','envelope',now())`, [household, run, hash]), /duplicate key/)
  for (const ordinal of [0, 1]) {
    await pg.query(`insert into financeapp_private.source_records
      (household_id,migration_run_id,source_backup_id,table_name,source_ordinal,entity_uuid,original_record,record_sha256)
      values ($1,$2,$3,'lancamentos',$4,'same-uuid','{}',$5)`, [household, run, backup, ordinal, hash])
  }
  assert.equal((await pg.query('select * from financeapp_private.source_records')).rows.length, 2)
  await assert.rejects(pg.query(`insert into financeapp_private.source_backups
    (household_id,migration_run_id,source_kind,source_id,sha256,manifest,envelope_text,captured_at)
    values ($1,$2,'iphone','device-b',$3,'{}','envelope',now())`, [otherHousehold, run, hash]), /foreign key/)
})
