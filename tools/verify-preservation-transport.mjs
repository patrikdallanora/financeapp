import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { encode, openBackup } from '../src/backup/backupCodec.js'

const [batchDir] = process.argv.slice(2)
if (!batchDir) throw new Error('Usage: node tools/verify-preservation-transport.mjs PRIVATE_BATCH_DIR')
const manifest = JSON.parse(await fs.readFile(path.join(batchDir, 'manifest.json'), 'utf8'))
const pg = new PGlite()
const canonical = []
try {
  await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid; $$;`)
  await pg.exec(await fs.readFile(new URL('../supabase/migrations/20261102133954_preservation_staging.sql', import.meta.url), 'utf8'))
  for (let pass = 0; pass < 2; pass++) {
    for (const batch of manifest.batches) await pg.exec(await fs.readFile(path.join(batchDir, batch), 'utf8'))
    for (const backup of manifest.manifest) {
      const stored = (await pg.query('select envelope_text,restore_verified_at from financeapp_private.source_backups where id=$1', [backup.backupId])).rows[0]
      assert.ok(stored.restore_verified_at)
      assert.equal(createHash('sha256').update(stored.envelope_text).digest('hex'), backup.sha256)
      const snapshot = await openBackup(JSON.parse(stored.envelope_text))
      for (const table of snapshot.tableNames) {
        const rows = (await pg.query('select original_record from financeapp_private.source_records where source_backup_id=$1 and table_name=$2 order by source_ordinal', [backup.backupId, table])).rows
        assert.deepEqual(rows.map(r => r.original_record), snapshot.tables[table].map(encode))
      }
      if (pass === 1) {
        const digest = (await pg.query(`select encode(sha256(convert_to(string_agg(table_name||chr(9)||source_ordinal::text||chr(9)||original_record::text,chr(10) order by table_name collate "C",source_ordinal),'UTF8')),'hex') as sha256 from financeapp_private.source_records where source_backup_id=$1`, [backup.backupId])).rows[0].sha256
        canonical.push({ file: backup.file, backupId: backup.backupId, records: backup.expectedRows, canonicalRecordsSha256: digest })
      }
    }
  }
  await fs.writeFile(path.join(batchDir, 'transport-verification.json'), JSON.stringify({ passes: 2, exactRestoration: true, backups: canonical }, null, 2))
  console.log(JSON.stringify({ passes: 2, exactRestoration: true, backups: canonical }))
} finally { await pg.close() }
