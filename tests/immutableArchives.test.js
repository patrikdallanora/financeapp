import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
const hash = s => createHash('sha256').update(s).digest('hex')
const migration = name => fs.readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8')

test('arquivo imutável só sela com todos os blocos e registros; repetição não altera cópia', async t => {
  const pg = new PGlite(); t.after(() => pg.close())
  await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;`)
  await pg.exec(await migration('20261102133954_preservation_staging.sql'))
  await pg.exec(await migration('20261102160320_immutable_preservation_archives.sql'))
  const h = (await pg.query("insert into public.financeapp_households(name) values('Test') returning id")).rows[0].id
  const r = (await pg.query('insert into financeapp_private.migration_runs(household_id) values($1) returning id',[h])).rows[0].id
  const text = 'backup com acentuação e 🧠', parts = ['backup com ', 'acentuação e 🧠']
  const b = (await pg.query(`insert into financeapp_private.source_backups(household_id,migration_run_id,source_kind,source_id,sha256,manifest,envelope_text,captured_at) values($1,$2,'iphone','test',$3,'{}','partial',now()) returning id`,[h,r,hash(text)])).rows[0].id
  const canonical = 'test\t0\t["scalar", "original"]'
  await pg.query('insert into financeapp_private.backup_archives values($1,$2,$3,2,$4,1,$5,now())',[b,h,r,Buffer.byteLength(text),hash(canonical)])
  const chunk = (index, content, sha=hash(content)) => pg.query('insert into financeapp_private.backup_archive_chunks values($1,$2,$3,$4) on conflict do nothing',[b,index,content,sha])
  const seal = () => pg.query("insert into financeapp_private.backup_archive_receipts(source_backup_id,file_sha256,records_sha256) values($1,'ignored','ignored') on conflict do nothing",[b])
  await assert.rejects(chunk(0,parts[0],'0'.repeat(64)),/check constraint/)
  await chunk(0,parts[0]); await assert.rejects(seal(),/file is incomplete/)
  await assert.rejects(chunk(0,'changed'),/Existing chunk differs/)
  await assert.rejects(chunk(2,'extra'),/Invalid chunk index/)
  await chunk(1,parts[1]); await assert.rejects(seal(),/records are incomplete/)
  await pg.query(`insert into financeapp_private.source_records(household_id,migration_run_id,source_backup_id,table_name,source_ordinal,original_record,record_sha256) values($1,$2,$3,'test',0,'["scalar","original"]',$4)`,[h,r,b,hash('["scalar","original"]')])
  await seal(); await chunk(0,parts[0]); await seal()
  assert.equal((await pg.query('select count(*) as n from financeapp_private.backup_archive_chunks')).rows[0].n,2)
  const receipt = (await pg.query('select * from financeapp_private.backup_archive_receipts')).rows[0]
  assert.equal(receipt.file_sha256,hash(text)); assert.equal(receipt.records_sha256,hash(canonical))
  for (const table of ['backup_archives','backup_archive_chunks','backup_archive_receipts','source_records']) {
    await assert.rejects(pg.exec(`delete from financeapp_private.${table}`),/immutable/)
    await assert.rejects(pg.exec(`truncate financeapp_private.${table} cascade`),/immutable/)
  }
  await assert.rejects(pg.exec("update financeapp_private.backup_archive_chunks set content='overwritten'"),/immutable/)
  assert.equal((await pg.query('select envelope_text from financeapp_private.source_backups')).rows[0].envelope_text,'partial')
  await pg.exec('set role authenticated')
  await assert.rejects(pg.query('select * from financeapp_private.backup_archive_chunks'),/permission denied/)
})
