import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { encode, openBackup } from '../src/backup/backupCodec.js'

// Creates PRIVATE SQL transport batches; never commit the generated directory.
const [inputDir, outputDir] = process.argv.slice(2)
if (!inputDir || !outputDir) throw new Error('Usage: node tools/prepare-remote-preservation.mjs INPUT_DIR PRIVATE_OUTPUT_DIR')
await fs.mkdir(outputDir, { recursive: true })
const hash = text => createHash('sha256').update(text).digest('hex')
const quote = value => value == null ? 'null' : "'" + String(value).replaceAll("'", "''") + "'"
const contextPath = path.join(outputDir, 'context.json')
let context
try { context = JSON.parse(await fs.readFile(contextPath, 'utf8')) }
catch (e) {
  if (e.code !== 'ENOENT') throw e
  context = { householdId: randomUUID(), migrationRunId: randomUUID(), backups: {} }
  await fs.writeFile(contextPath, JSON.stringify(context), { flag: 'wx' })
}
const h = quote(context.householdId), run = quote(context.migrationRunId)
const batches = []
const save = async (name, sql) => {
  await fs.writeFile(path.join(outputDir, name), `begin;\n${sql}\ncommit;`)
  batches.push(name)
}
await save('0000-context.sql', `insert into public.financeapp_households(id,name) values (${h},'FinanceApp') on conflict(id) do nothing;
insert into financeapp_private.migration_runs(id,household_id,expected_devices) values (${run},${h},'["iphone-15-pro","iphone-16-pro"]') on conflict(id) do nothing;`)
let seq = 1
const manifest = []
for (const file of (await fs.readdir(inputDir)).filter(f => /^financeapp-.*\.json$/.test(f)).sort()) {
  const text = await fs.readFile(path.join(inputDir, file), 'utf8')
  const envelope = JSON.parse(text), snapshot = await openBackup(envelope)
  const sha = hash(text)
  context.backups[sha] ||= randomUUID()
  await fs.writeFile(contextPath, JSON.stringify(context))
  const id = quote(context.backups[sha])
  const name = () => String(seq++).padStart(4, '0') + '.sql'
  await save(name(), `insert into financeapp_private.source_backups(id,household_id,migration_run_id,source_kind,source_id,source_origin,sha256,manifest,envelope_text,captured_at)
values (${id},${h},${run},'iphone',${quote(snapshot.source.deviceId)},${quote(snapshot.source.origin)},${quote(sha)},${quote(JSON.stringify({ file, payloadSha256: envelope.sha256, counts: snapshot.counts, tableNames: snapshot.tableNames }))}::jsonb,'',${quote(snapshot.createdAt)}) on conflict(id) do nothing;`)
  // Offset guarded chunks make retries idempotent; final hash detects truncation.
  let offset = 0
  for (let pos = 0; pos < text.length;) {
    let end = Math.min(pos + 12000, text.length)
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--
    const chunk = text.slice(pos, end)
    const beforeHash = hash(text.slice(0, pos))
    const afterHash = hash(text.slice(0, end))
    await save(name(), `-- Only an unverified partial transport may be extended. Both prefixes must match the verified local original byte-for-byte.
update financeapp_private.source_backups set envelope_text=envelope_text||${quote(chunk)}
where id=${id} and restore_verified_at is null and char_length(envelope_text)=${offset}
and encode(sha256(convert_to(envelope_text,'UTF8')),'hex')=${quote(beforeHash)}
and encode(sha256(convert_to(envelope_text||${quote(chunk)},'UTF8')),'hex')=${quote(afterHash)};`)
    offset += [...chunk].length
    pos = end
  }
  let rows = [], expectedRows = 0
  const flush = async () => {
    if (!rows.length) return
    const values = rows.join(',\n')
    await save(name(), `with incoming(household_id,migration_run_id,source_backup_id,table_name,source_ordinal,legacy_id,entity_uuid,original_record,record_sha256) as (values ${values}), inserted as (
insert into financeapp_private.source_records(household_id,migration_run_id,source_backup_id,table_name,source_ordinal,legacy_id,entity_uuid,original_record,record_sha256)
select * from incoming on conflict(source_backup_id,table_name,source_ordinal) do nothing returning id)
select count(*) as inserted from inserted;`)
    rows = []
  }
  for (const table of snapshot.tableNames) for (const [ordinal, record] of snapshot.tables[table].entries()) {
    const encoded = JSON.stringify(encode(record))
    rows.push(`(${h}::uuid,${run}::uuid,${id}::uuid,${quote(table)}::text,${ordinal}::bigint,${quote(record.id)}::text,${quote(record.uuid)}::text,${quote(encoded)}::jsonb,${quote(hash(encoded))}::text)`)
    expectedRows++
    if (rows.join('').length > 18000) await flush()
  }
  await flush()
  // Mark verified only when exact file hash and full row count agree.
  await save(name(), `do $$ begin
if not exists(select 1 from financeapp_private.source_backups where id=${id} and encode(sha256(convert_to(envelope_text,'UTF8')),'hex')=sha256) then raise exception 'Envelope hash mismatch'; end if;
if (select count(*) from financeapp_private.source_records where source_backup_id=${id})<>${expectedRows} then raise exception 'Record count mismatch'; end if;
update financeapp_private.source_backups set restore_verified_at=now() where id=${id}; end $$;`)
  manifest.push({ file, sha256: sha, backupId: context.backups[sha], expectedRows })
}
await fs.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify({ ...context, manifest, batches }, null, 2))
console.log(JSON.stringify({ backups: manifest.length, rows: manifest.reduce((n,b) => n+b.expectedRows,0), batches: batches.length }))
