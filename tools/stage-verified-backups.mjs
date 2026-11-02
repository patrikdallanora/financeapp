import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { encode, openBackup } from '../src/backup/backupCodec.js'

const [inputDir, outputDir] = process.argv.slice(2)
if (!inputDir || !outputDir) throw new Error('Uso: node tools/stage-verified-backups.mjs PHONE_DIR PRIVATE_OUTPUT_DIR')
await fs.mkdir(outputDir, { recursive: true })
const hash = value => createHash('sha256').update(value).digest('hex')
const files = (await fs.readdir(inputDir)).filter(name => name.startsWith('financeapp-') && name.endsWith('.json')).sort()
const pg = new PGlite(path.join(outputDir, 'local-postgres'))
try {
  if (!(await pg.query("select to_regclass('financeapp_private.migration_runs') as existing")).rows[0].existing) {
    // Local-only platform scaffolding. No remote Auth account or credentials.
    await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid; $$;`)
    const migration = await fs.readFile(new URL('../supabase/migrations/202611010001_preservation_staging.sql', import.meta.url), 'utf8')
    await pg.exec(migration)
  }
  let context
  const contextPath = path.join(outputDir, 'staging-context.json')
  try { context = JSON.parse(await fs.readFile(contextPath, 'utf8')) }
  catch (error) {
    if (error.code !== 'ENOENT') throw error
    context = { householdId: randomUUID(), migrationRunId: randomUUID(), kind: 'local-only-preservation' }
    await fs.writeFile(contextPath, JSON.stringify(context, null, 2), { flag: 'wx' })
  }
  await pg.query(`insert into public.financeapp_households(id,name) values ($1,'FinanceApp preservation local') on conflict (id) do nothing`, [context.householdId])
  await pg.query(`insert into financeapp_private.migration_runs(id,household_id,expected_devices)
    values ($1,$2,$3) on conflict(id) do nothing`, [context.migrationRunId, context.householdId,
    JSON.stringify(['iphone-15-pro', 'iphone-16-pro'])])

  const verified = []
  for (const file of files) {
    const text = await fs.readFile(path.join(inputDir, file), 'utf8')
    const envelope = JSON.parse(text)
    const snapshot = await openBackup(envelope)
    await pg.transaction(async tx => {
      const backup = (await tx.query(`insert into financeapp_private.source_backups
        (household_id,migration_run_id,source_kind,source_id,source_origin,sha256,manifest,envelope_text,captured_at)
        values ($1,$2,'iphone',$3,$4,$5,$6,$7,$8)
        on conflict (migration_run_id,source_kind,source_id,sha256)
        do update set sha256=excluded.sha256 returning id`,
      [context.householdId, context.migrationRunId, snapshot.source.deviceId, snapshot.source.origin,
        hash(text), JSON.stringify({ file, payloadSha256: envelope.sha256, counts: snapshot.counts,
          tableNames: snapshot.tableNames, label: snapshot.source.label }), text, snapshot.createdAt])).rows[0].id
      for (const table of snapshot.tableNames) {
        for (const [ordinal, record] of snapshot.tables[table].entries()) {
          const encoded = encode(record)
          await tx.query(`insert into financeapp_private.source_records
            (household_id,migration_run_id,source_backup_id,table_name,source_ordinal,legacy_id,entity_uuid,original_record,record_sha256)
            values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            on conflict (source_backup_id,table_name,source_ordinal) do nothing`,
          [context.householdId, context.migrationRunId, backup, table, ordinal, record.id == null ? null : String(record.id),
            record.uuid == null ? null : String(record.uuid), JSON.stringify(encoded), hash(JSON.stringify(encoded))])
        }
        const restored = (await tx.query(`select original_record from financeapp_private.source_records
          where source_backup_id=$1 and table_name=$2 order by source_ordinal`, [backup, table])).rows.map(row => row.original_record)
        if (JSON.stringify(restored) !== JSON.stringify(snapshot.tables[table].map(encode))) {
          throw new Error(`Conteúdo do staging divergente: ${file}, ${table}`)
        }
      }
      await tx.query('update financeapp_private.source_backups set restore_verified_at=now() where id=$1', [backup])
      verified.push({ file, tables: snapshot.tableNames.length,
        rows: Object.values(snapshot.counts).reduce((a, b) => a + b, 0), contentVerified: true })
    })
  }
  const result = { kind: context.kind, backups: verified,
    storedSourceRecords: Number((await pg.query('select count(*) as count from financeapp_private.source_records')).rows[0].count),
    syncEnabled: (await pg.query('select sync_enabled from public.financeapp_households where id=$1', [context.householdId])).rows[0].sync_enabled }
  await fs.writeFile(path.join(outputDir, 'staging-verification.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
} finally { await pg.close() }
