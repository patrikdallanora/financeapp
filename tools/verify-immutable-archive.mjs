import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { encode, openBackup } from '../src/backup/backupCodec.js'
const [inputFile,preservationDir,archiveDir]=process.argv.slice(2)
const sourceText=await fs.readFile(inputFile,'utf8'),snapshot=await openBackup(JSON.parse(sourceText))
const context=JSON.parse(await fs.readFile(path.join(preservationDir,'context.json'),'utf8'))
const manifest=JSON.parse(await fs.readFile(path.join(archiveDir,'manifest.json'),'utf8'))
const pg=new PGlite()
try {
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;`)
 for(const name of ['20261102133954_preservation_staging.sql','20261102160320_immutable_preservation_archives.sql'])await pg.exec(await fs.readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'))
 await pg.query("insert into public.financeapp_households(id,name) values($1,'Test')",[context.householdId])
 await pg.query('insert into financeapp_private.migration_runs(id,household_id) values($1,$2)',[context.migrationRunId,context.householdId])
 await pg.query(`insert into financeapp_private.source_backups(id,household_id,migration_run_id,source_kind,source_id,sha256,manifest,envelope_text,captured_at) values($1,$2,$3,'iphone',$4,$5,'{}','quarantined partial',now())`,[manifest.source.backupId,context.householdId,context.migrationRunId,snapshot.source.deviceId,manifest.source.sha256])
 for(let pass=0;pass<2;pass++){
  for(const batch of manifest.batches)await pg.exec(await fs.readFile(path.join(archiveDir,batch),'utf8'))
  const restored=(await pg.query("select string_agg(content,'' order by chunk_index) as text from financeapp_private.backup_archive_chunks")).rows[0].text
  assert.equal(restored,sourceText)
  for(const table of snapshot.tableNames){const rows=(await pg.query('select original_record from financeapp_private.source_records where table_name=$1 order by source_ordinal',[table])).rows;assert.deepEqual(rows.map(r=>r.original_record),snapshot.tables[table].map(encode))}
  assert.equal((await pg.query('select file_sha256 from financeapp_private.backup_archive_receipts')).rows[0].file_sha256,manifest.source.sha256)
  assert.equal((await pg.query('select envelope_text from financeapp_private.source_backups')).rows[0].envelope_text,'quarantined partial')
 }
 const result={passes:2,exactRestoration:true,originalPartialUnchanged:true,records:manifest.expected.records,canonicalRecordsSha256:manifest.expected.canonicalRecordsSha256,fileSha256:manifest.source.sha256}
 await fs.writeFile(path.join(archiveDir,'local-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}finally{await pg.close()}
