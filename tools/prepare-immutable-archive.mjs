import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { encode, openBackup } from '../src/backup/backupCodec.js'

const [inputFile, preservationDir, outputDir] = process.argv.slice(2)
if (!outputDir) throw new Error('Usage: node tools/prepare-immutable-archive.mjs ORIGINAL_JSON PRIVATE_PRESERVATION_DIR PRIVATE_OUTPUT_DIR')
const hash = s => createHash('sha256').update(s).digest('hex')
const q = s => s == null ? 'null' : "'" + String(s).replaceAll("'", "''") + "'"
const text = await fs.readFile(inputFile,'utf8'), envelope = JSON.parse(text), snapshot = await openBackup(envelope)
const context = JSON.parse(await fs.readFile(path.join(preservationDir,'manifest.json'),'utf8'))
const verified = JSON.parse(await fs.readFile(path.join(preservationDir,'transport-verification.json'),'utf8'))
const source = context.manifest.find(b => b.sha256 === hash(text))
assert.ok(source,'Original file must match the preservation manifest')
const expected = verified.backups.find(b => b.backupId === source.backupId)
assert.ok(verified.exactRestoration && expected,'Exact local restoration must have been verified')
await fs.mkdir(outputDir,{recursive:true})
const blocks=[]
for(let pos=0;pos<text.length;){
  let end=Math.min(pos+16000,text.length)
  if(end<text.length && /[\uD800-\uDBFF]/.test(text[end-1])) end--
  blocks.push(text.slice(pos,end)); pos=end
}
let batch='', index=0; const batches=[]
const flush=async()=>{if(!batch)return;const file=String(index++).padStart(4,'0')+'.sql';await fs.writeFile(path.join(outputDir,file),'begin;\n'+batch+'\ncommit;');batches.push(file);batch=''}
const add=async sql=>{if(batch.length+sql.length>120000)await flush();batch+=sql+'\n'}
const id=q(source.backupId),h=q(context.householdId),r=q(context.migrationRunId)
await add(`insert into financeapp_private.backup_archives(source_backup_id,household_id,migration_run_id,chunk_count,file_bytes,expected_records,expected_records_sha256) values(${id},${h},${r},${blocks.length},${Buffer.byteLength(text)},${expected.records},${q(expected.canonicalRecordsSha256)}) on conflict do nothing;`)
for(const [ordinal, content] of blocks.entries()) await add(`insert into financeapp_private.backup_archive_chunks(source_backup_id,chunk_index,content,sha256) values(${id},${ordinal},${q(content)},${q(hash(content))}) on conflict do nothing;`)
for(const table of snapshot.tableNames) for(const [ordinal,record] of snapshot.tables[table].entries()) {
 const encoded=JSON.stringify(encode(record))
 await add(`insert into financeapp_private.source_records(household_id,migration_run_id,source_backup_id,table_name,source_ordinal,legacy_id,entity_uuid,original_record,record_sha256) values(${h},${r},${id},${q(table)},${ordinal},${q(record.id)},${q(record.uuid)},${q(encoded)}::jsonb,${q(hash(encoded))}) on conflict(source_backup_id,table_name,source_ordinal) do nothing;`)
}
await add(`insert into financeapp_private.backup_archive_receipts(source_backup_id,file_sha256,records_sha256) values(${id},${q(source.sha256)},${q(expected.canonicalRecordsSha256)}) on conflict do nothing;`)
await flush()
await fs.writeFile(path.join(outputDir,'manifest.json'),JSON.stringify({source,expected,blocks:blocks.length,batches},null,2))
console.log(JSON.stringify({blocks:blocks.length,records:expected.records,batches:batches.length}))
