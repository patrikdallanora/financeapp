import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
const owner=randomUUID(), outsider=randomUUID(),household=randomUUID(),other=randomUUID(),device=randomUUID()
const schemaFiles=['20261102133954_preservation_staging.sql','20261102160320_immutable_preservation_archives.sql','20261102162531_canonical_sync_protocol.sql','20261102170601_freeze_preservation_evidence.sql']
async function setup(t){
 const pg=new PGlite();t.after(()=>pg.close())
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;insert into auth.users values('${owner}'),('${outsider}');`)
 for(const f of schemaFiles)await pg.exec(await fs.readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'))
 await pg.query("insert into public.financeapp_households(id,name) values($1,'Home'),($2,'Other')",[household,other])
 await pg.query("insert into financeapp_private.memberships(household_id,user_id,role) values($1,$2,'owner')",[household,owner])
 await pg.exec(`set role authenticated;set request.jwt.claim.sub='${owner}'`)
 const send=async(changes,id=randomUUID(),home=household)=>(await pg.query('select public.financeapp_apply_mutation($1,$2,$3,1,$4) as result',[home,id,device,JSON.stringify(changes)])).rows[0].result
 const pull=async(after=0,limit=200)=>(await pg.query('select public.financeapp_pull_changes($1,$2,$3) as result',[household,after,limit])).rows[0].result
 return {pg,send,pull,enable:async()=>{await pg.exec('reset role');await pg.query('update public.financeapp_households set sync_enabled=true where id=$1',[household]);await pg.exec('set role authenticated')}}
}
const category=(uuid=randomUUID(),name='Home',baseRevision=0)=>({table:'categorias',uuid,baseRevision,payload:{uuid,nome:name,tipo:'despesa',deletedAt:null}})
const entry=(uuid=randomUUID(),extra={})=>({table:'lancamentos',uuid,baseRevision:0,payload:{uuid,descricao:'Expense',tipo:'despesa',valor:10001,status:'pendente',dataCompetencia:'2026-11-02',deletedAt:null,...extra}})

test('sync pausado, RLS e UUIDs não permitem acesso a outra base ou escrita direta',async t=>{
 const {pg,send,pull,enable}=await setup(t)
 await assert.rejects(send([category()]),/paused/);await enable()
 await assert.rejects(send([category()],randomUUID(),other),/Not a household member/)
 await assert.rejects(pg.exec("insert into public.financeapp_records(household_id,table_name,uuid,payload,revision,updated_at) values(gen_random_uuid(),'categorias',gen_random_uuid(),'{}',1,now())"),/permission denied/)
 await send([category()]);await pg.exec(`set request.jwt.claim.sub='${outsider}'`)
 assert.equal((await pg.query('select count(*) as n from public.financeapp_records')).rows[0].n,0)
 await assert.rejects(pull(),/Not a household member/)
 await pg.exec('reset role;set role anon');await assert.rejects(pull(),/permission denied/)
})
test('recibo idempotente não duplica, não usa relógio cliente e conserva conflitos',async t=>{
 const {pg,send,enable}=await setup(t);await enable()
 const first=category(),id=randomUUID(),result=await send([first],id)
 assert.equal(result.status,'applied');assert.deepEqual(await send([first],id),result)
 assert.equal((await pg.query('select count(*) as n from public.financeapp_records')).rows[0].n,1)
 await assert.rejects(send([{...first,payload:{...first.payload,nome:'Different'}}],id),/reused/)
 const second={...first,baseRevision:result.records[0].revision,payload:{...first.payload,nome:'Updated',updatedAt:'1900-01-01'}}
 const update=await send([second]);assert.ok(update.records[0].revision>result.records[0].revision)
 const conflict=await send([{...first,payload:{...first.payload,nome:'Clock ahead',updatedAt:'2100-01-01'}}])
 assert.equal(conflict.status,'conflict');assert.equal(conflict.conflicts[0].current.payload.nome,'Updated')
 await pg.exec('reset role');await pg.query('update public.financeapp_households set sync_enabled=false where id=$1',[household]);await pg.exec('set role authenticated')
 assert.deepEqual(await send([first],id),result)
})
test('pagamento de vários itens é atômico; centavos, datas e vínculos são validados',async t=>{
 const {pg,send,enable}=await setup(t);await enable()
 const cat=category(),a=entry(),b=entry(undefined,{categoriaUuid:randomUUID()})
 await assert.rejects(send([cat,a,b]),/Missing UUID relation/)
 assert.equal((await pg.query('select count(*) as n from public.financeapp_records')).rows[0].n,0)
 await assert.rejects(send([entry(undefined,{valor:1.5})]),/Invalid centavos/)
 await assert.rejects(send([entry(undefined,{dataCompetencia:'2026-02-30'})]),/date|range/)
 await assert.rejects(send([entry(undefined,{usuarioId:1})]),/Local-only/)
 await assert.rejects(send([entry(undefined,{faturaRef:'2026-13'})]),/date|range|month/)
 const sub=category();sub.table='subcategorias';sub.payload={uuid:sub.uuid,nome:'Sub',categoriaUuid:cat.uuid}
 const good=entry(undefined,{categoriaUuid:cat.uuid,subcategoriaUuid:sub.uuid})
 const initial=await send([good,sub,cat]);assert.equal(initial.records.length,3)
 const rev=initial.records.find(x=>x.uuid===good.uuid).revision
 const paid={...good,baseRevision:rev,payload:{...good.payload,status:'pago',faturaValorPago:10001,faturaFechada:true,dataPagamento:'2026-11-02'}}
 const bad={...sub,baseRevision:initial.records.find(x=>x.uuid===sub.uuid).revision,payload:{...sub.payload,categoriaUuid:randomUUID()}}
 await assert.rejects(send([paid,bad]),/Missing UUID relation|category differs|Subcategory parent differs/)
 assert.equal((await pg.query('select payload from public.financeapp_records where uuid=$1',[good.uuid])).rows[0].payload.status,'pendente')
 await send([paid]);assert.equal((await pg.query('select payload from public.financeapp_records where uuid=$1',[good.uuid])).rows[0].payload.status,'pago')
})
test('pull pagina sem perder tombstones e rejeita cursor futuro',async t=>{
 const {pg,send,pull,enable}=await setup(t);await enable()
 const a=category(),b=category(),c=category();const first=await send([a,b,c])
 let page=await pull(0,2);assert.equal(page.records.length,2);assert.equal(page.more,true);assert.equal(page.tables.length,7)
 const next=await pull(page.next,2);assert.equal(next.records.length,1);assert.equal(next.more,false)
 const record=first.records.find(x=>x.uuid===a.uuid)
 await send([{...a,baseRevision:record.revision,payload:{...a.payload,deletedAt:'2026-11-02T12:00:00Z'}}])
 const tombstone=await pull(next.next,2);assert.equal(tombstone.records[0].payload.deletedAt,'2026-11-02T12:00:00Z')
 await assert.rejects(pull(tombstone.head+1),/Cursor ahead/)
 assert.equal((await pull(tombstone.next)).records.length,0)
 await pg.exec('reset role')
 await pg.query('insert into public.financeapp_records select * from public.financeapp_records where uuid=$1 on conflict do nothing',[a.uuid])
 await pg.exec('set role authenticated')
 const gap=await pull(tombstone.next)
 assert.equal(gap.records.length,0);assert.equal(gap.more,false);assert.equal(gap.next,gap.head)
})
test('envelopes e decisões aceitas não podem ser sobrescritos nem truncados',async t=>{
 const {pg}=await setup(t);await pg.exec('reset role')
 const run=(await pg.query('insert into financeapp_private.migration_runs(household_id) values($1) returning id',[household])).rows[0].id
 await pg.query(`insert into financeapp_private.source_backups(household_id,migration_run_id,source_kind,source_id,sha256,manifest,envelope_text,captured_at) values($1,$2,'iphone','original',$3,'{}','original envelope',now())`,[household,run,'a'.repeat(64)])
 await pg.query(`insert into financeapp_private.canonical_imports(household_id,migration_run_id,candidate_sha256,manifest,decisions) values($1,$2,$3,'{}','{}')`,[household,run,'b'.repeat(64)])
 await assert.rejects(pg.exec("update financeapp_private.source_backups set envelope_text='changed'"),/immutable/)
 await assert.rejects(pg.exec('delete from financeapp_private.canonical_imports'),/immutable/)
 await assert.rejects(pg.exec('truncate financeapp_private.source_backups cascade'),/immutable/)
 assert.equal((await pg.query('select envelope_text from financeapp_private.source_backups')).rows[0].envelope_text,'original envelope')
})
