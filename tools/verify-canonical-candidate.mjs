import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { createHash,randomUUID } from 'node:crypto'
const [directory]=process.argv.slice(2)
const candidate=JSON.parse(await fs.readFile(path.join(directory,'candidate-private.json'),'utf8'))
assert.equal(candidate.ready,true);assert.equal(candidate.unresolved.length,0)
const pg=new PGlite(),h=randomUUID()
try {
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;`)
 for(const f of ['20261102133954_preservation_staging.sql','20261102160320_immutable_preservation_archives.sql','20261102162531_canonical_sync_protocol.sql'])await pg.exec(await fs.readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'))
 await pg.query("insert into public.financeapp_households(id,name) values($1,'Test')",[h])
 for(let pass=0;pass<2;pass++){
  await pg.transaction(async tx=>{for(const [table,rows]of Object.entries(candidate.tables))for(const record of rows)await tx.query('insert into public.financeapp_records(household_id,table_name,uuid,payload,revision,updated_at) values($1,$2,$3,$4,0,now()) on conflict do nothing',[h,table,record.uuid,JSON.stringify(record)])})
  for(const [table,rows]of Object.entries(candidate.tables))assert.deepEqual((await pg.query('select payload from public.financeapp_records where table_name=$1 order by uuid',[table])).rows.map(r=>r.payload),rows)
 }
 const canonical=(await pg.query(`select string_agg(table_name||chr(9)||uuid::text||chr(9)||payload::text,chr(10) order by table_name collate "C",uuid) as text from public.financeapp_records`)).rows[0].text
 const result={passes:2,exactRestoration:true,counts:candidate.counts,records:Object.values(candidate.counts).reduce((a,b)=>a+b,0),canonicalRecordsSha256:createHash('sha256').update(canonical).digest('hex')}
 await fs.writeFile(path.join(directory,'domain-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}finally{await pg.close()}
