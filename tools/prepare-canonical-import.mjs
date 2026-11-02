import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
const [candidateDir,preservationDir,outDir]=process.argv.slice(2)
const text=await fs.readFile(path.join(candidateDir,'candidate-private.json'),'utf8'),candidate=JSON.parse(text)
const verified=JSON.parse(await fs.readFile(path.join(candidateDir,'domain-verification.json'),'utf8'))
const decisions=JSON.parse(await fs.readFile(path.join(candidateDir,'decisions.json'),'utf8'))
const context=JSON.parse(await fs.readFile(path.join(preservationDir,'context.json'),'utf8'))
assert.ok(candidate.ready&&verified.exactRestoration&&verified.passes===2)
const q=s=>s==null?'null':"'"+String(s).replaceAll("'","''")+"'"
const h=q(context.householdId),run=q(context.migrationRunId),hash=createHash('sha256').update(text).digest('hex')
await fs.mkdir(outDir,{recursive:true});let sql='',index=0;const batches=[]
const flush=async()=>{if(!sql)return;const name=String(index++).padStart(4,'0')+'.sql';await fs.writeFile(path.join(outDir,name),'begin;\n'+sql+'\ncommit;');batches.push(name);sql=''}
const add=async part=>{if(sql.length+part.length>90000)await flush();sql+=part+'\n'}
for(const [table,rows]of Object.entries(candidate.tables))for(const record of rows)await add(`insert into public.financeapp_records(household_id,table_name,uuid,payload,revision,updated_at) values(${h},${q(table)},${q(record.uuid)},${q(JSON.stringify(record))}::jsonb,0,now()) on conflict(household_id,table_name,uuid) do nothing;`)
for(const [table,aliases]of Object.entries({categorias:candidate.aliases,usuarios:candidate.personAliases}))for(const [from,to]of Object.entries(aliases))await add(`insert into financeapp_private.identity_aliases(household_id,table_name,legacy_uuid,canonical_uuid,reason) values(${h},${q(table)},${q(from)},${q(to)},'user_confirmed_2026-11-02') on conflict do nothing;`)
await add(`insert into financeapp_private.canonical_imports(household_id,migration_run_id,candidate_sha256,manifest,decisions) values(${h},${run},${q(hash)},${q(JSON.stringify(verified))}::jsonb,${q(JSON.stringify(decisions))}::jsonb) on conflict do nothing;`)
await add(`do $$ declare actual text; n bigint; begin
select count(*),encode(sha256(convert_to(string_agg(table_name||chr(9)||uuid::text||chr(9)||payload::text,chr(10) order by table_name collate "C",uuid),'UTF8')),'hex') into n,actual from public.financeapp_records where household_id=${h};
if n<>${verified.records} or actual<>${q(verified.canonicalRecordsSha256)} then raise exception 'Canonical import mismatch'; end if;
if not exists(select 1 from financeapp_private.canonical_imports where household_id=${h} and migration_run_id=${run} and candidate_sha256=${q(hash)}) then raise exception 'Candidate manifest differs'; end if;
end $$;`)
await flush();await fs.writeFile(path.join(outDir,'manifest.json'),JSON.stringify({batches,records:verified.records,candidateSha256:hash,canonicalRecordsSha256:verified.canonicalRecordsSha256},null,2))
console.log(JSON.stringify({batches:batches.length,records:verified.records}))
