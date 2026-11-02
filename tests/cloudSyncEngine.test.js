import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {createCloudDatabase} from '../src/db/cloudDatabase.js'
import {createCloudSyncEngine} from '../src/sync/cloudSyncEngine.js'
import {resolveCloudConflict} from '../src/sync/resolveCloudConflict.js'
async function fixture(t){
 const pg=new PGlite();t.after(()=>pg.close());const household=randomUUID(),owner=randomUUID(),entry=randomUUID()
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`)
 for(const f of ['20261102133954_preservation_staging.sql','20261102160320_immutable_preservation_archives.sql','20261102162531_canonical_sync_protocol.sql'])await pg.exec(await fs.readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'))
 await pg.query('insert into auth.users values($1)',[owner]);await pg.query("insert into public.financeapp_households(id,name,sync_enabled) values($1,'Test',true)",[household])
 await pg.query("insert into financeapp_private.memberships(household_id,user_id,role) values($1,$2,'owner')",[household,owner])
 await pg.query(`insert into public.financeapp_records(household_id,table_name,uuid,payload,revision,updated_at) values($1,'lancamentos',$2,$3,0,now())`,[household,entry,JSON.stringify({uuid:entry,descricao:'Test',tipo:'despesa',valor:1025,status:'pendente',dataCompetencia:'2026-11-02',deletedAt:null})])
 await pg.exec(`set role authenticated;set request.jwt.claim.sub='${owner}'`)
 const rpc=async(name,args)=>{
  const result=name==='financeapp_apply_mutation'?await pg.query('select public.financeapp_apply_mutation($1,$2,$3,$4,$5) as result',[args.p_household,args.p_mutation,args.p_device,args.p_protocol,JSON.stringify(args.p_changes)]):await pg.query('select public.financeapp_pull_changes($1,$2,$3) as result',[args.p_household,args.p_after,args.p_limit])
  return result.rows[0].result
 }
 async function phone(transport=rpc){const db=createCloudDatabase('test-engine-'+randomUUID());await db.raw.open();t.after(()=>db.raw.delete());await db.raw.syncState.put({key:'context',householdId:household,deviceId:randomUUID(),ready:false});const engine=createCloudSyncEngine({raw:db.raw,rpc:transport,authorize:async()=>({id:household})});await engine.run();return {...db,engine}}
 const serverRows=async()=>(await pg.query('select * from public.financeapp_records')).rows
 return {pg,rpc,phone,entry,household,serverRows}
}
test('dois aparelhos convergem; resposta perdida após commit repete ID sem duplicar a baixa',async t=>{
 const f=await fixture(t);let lose=false
 const a=await f.phone(async(name,args)=>{const r=await f.rpc(name,args);if(lose&&name==='financeapp_apply_mutation'){lose=false;throw new Error('response lost after commit')}return r}),b=await f.phone()
 const local=await a.raw.lancamentos.where('uuid').equals(f.entry).first()
 await a.db.lancamentos.update(local.id,{status:'pago',dataPagamento:'2026-11-02',faturaValorPago:10.25})
 lose=true;await assert.rejects(a.engine.run(),/response lost/)
 const sent=(await a.raw.outbox.toArray())[0];assert.equal(sent.status,'sending')
 await b.engine.run();assert.equal((await b.raw.lancamentos.toArray())[0].status,'pago')
 await a.engine.run();assert.equal((await a.engine.counts()).pendentes,0)
 assert.equal((await f.serverRows()).length,1);assert.equal((await f.serverRows())[0].payload.faturaValorPago,1025)
 await f.pg.exec('reset role');assert.equal((await f.pg.query('select count(*) as n from financeapp_private.mutation_receipts')).rows[0].n,1)
})
test('edições concorrentes preservam ambas e revisão usa ID novo e revisão esperada atual',async t=>{
 const f=await fixture(t),a=await f.phone(),b=await f.phone()
 await a.db.lancamentos.update(1,{valor:20});await b.db.lancamentos.update(1,{valor:30})
 await a.engine.run();await b.engine.run()
 assert.equal((await f.serverRows())[0].payload.valor,2000);assert.equal((await b.raw.lancamentos.get(1)).valor,30)
 const op=(await b.raw.outbox.toArray())[0];assert.equal(op.status,'conflict')
 await resolveCloudConflict(b.raw,op.sequence,'local',await f.serverRows())
 assert.notEqual((await b.raw.outbox.get(op.sequence)).mutationId,op.mutationId)
 await b.engine.run();await a.engine.run()
 assert.equal((await a.raw.lancamentos.get(1)).valor,30);assert.equal((await b.raw.lancamentos.get(1)).valor,30)
 assert.equal((await b.raw.outbox.get(op.sequence)).resolutionHistory.length,1)
})
test('escolher servidor não apaga uma edição posterior que depende do conflito',async t=>{
 const f=await fixture(t),a=await f.phone(),b=await f.phone()
 await a.db.lancamentos.update(1,{valor:20});await b.db.lancamentos.update(1,{valor:30});await a.engine.run();await b.engine.run()
 const conflict=(await b.raw.outbox.toArray())[0]
 await b.db.lancamentos.update(1,{valor:40})
 await resolveCloudConflict(b.raw,conflict.sequence,'server',await f.serverRows())
 assert.equal((await b.raw.lancamentos.get(1)).valor,40)
 await b.engine.run();assert.equal((await f.serverRows())[0].payload.valor,4000)
 assert.equal((await b.engine.counts()).pendentes,0)
})
test('revisão não ressuscita valor descartado quando duas edições posteriores alteram outros campos',async t=>{
 const f=await fixture(t),a=await f.phone(),b=await f.phone()
 await a.db.lancamentos.update(1,{valor:20});await b.db.lancamentos.update(1,{valor:30});await a.engine.run();await b.engine.run()
 const conflict=(await b.raw.outbox.toArray())[0]
 await b.db.lancamentos.update(1,{descricao:'Later description'})
 await b.db.lancamentos.update(1,{dataCompetencia:'2026-11-03'})
 await resolveCloudConflict(b.raw,conflict.sequence,'server',await f.serverRows())
 assert.equal((await b.raw.lancamentos.get(1)).valor,20)
 await b.engine.run()
 const result=(await f.serverRows())[0].payload
 assert.equal(result.valor,2000);assert.equal(result.descricao,'Later description');assert.equal(result.dataCompetencia,'2026-11-03')
 assert.equal((await b.engine.counts()).pendentes,0)
})
