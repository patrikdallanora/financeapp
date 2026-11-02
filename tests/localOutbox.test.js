import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import Dexie from 'dexie'
import {randomUUID} from 'node:crypto'
import {BUSINESS_TABLES,SYNC_STORES,createOutboxFacade,freezeNextOperation,acceptOperationReceipt,stageAndApplyPull} from '../src/sync/localOutbox.js'
async function setup(t){
 const raw=new Dexie('test-outbox-'+randomUUID());raw.version(1).stores({...Object.fromEntries(BUSINESS_TABLES.map(x=>[x,'++id,&uuid'])),...SYNC_STORES})
 await raw.open();t.after(()=>raw.delete())
 const household=randomUUID();await raw.syncState.put({key:'context',householdId:household,deviceId:randomUUID(),ready:true})
 return {raw,...createOutboxFacade(raw),household}
}
const entry=(extra={})=>({uuid:randomUUID(),descricao:'Test',valor:10.25,tipo:'despesa',status:'pendente',dataCompetencia:'2026-11-02',deletedAt:null,...extra})
const receipt=(op,rev=100)=>({status:'applied',mutationId:op.mutationId,records:op.frozenRequest.p_changes.map((c,i)=>({table_name:c.table,uuid:c.uuid,payload:c.payload,revision:rev+i}))})
const page=(household,after,head,records,next=head,more=false)=>({protocol:1,householdId:household,after,head,next,more,tables:BUSINESS_TABLES,records})

test('ação e outbox são atômicas inclusive quando a fila falha; pagamento tem uma operação',async t=>{
 const {raw,db}=await setup(t),a=entry(),b=entry();await db.transaction('rw',db.lancamentos,async()=>{await db.lancamentos.add(a);await db.lancamentos.add(b)})
 assert.equal(await raw.outbox.count(),1);assert.equal((await raw.outbox.toArray())[0].changes.length,2)
 const fail=()=>{throw new Error('quota simulation')};raw.outbox.hook('creating',fail)
 await assert.rejects(db.lancamentos.update(1,{valor:99}),/quota simulation/)
 assert.equal((await raw.lancamentos.get(1)).valor,10.25);assert.equal(await raw.outbox.count(),1)
 raw.outbox.hook('creating').unsubscribe(fail)
 await assert.rejects(db.transaction('rw',db.lancamentos,async()=>{await db.lancamentos.update(1,{status:'pago'});throw new Error('interrupted')}),/interrupted/)
 assert.equal((await raw.lancamentos.get(1)).status,'pendente')
 assert.throws(()=>db.lancamentos.delete(1),/Exclusão física/)
})
test('fechamento/reabertura conserva operação; edição durante envio não é apagada pelo recibo',async t=>{
 const {raw,db}=await setup(t),a=entry();const id=await db.lancamentos.add(a)
 const op=await freezeNextOperation(raw),frozen=JSON.stringify(op.frozenRequest)
 assert.equal(op.frozenRequest.p_changes[0].payload.valor,1025)
 raw.close();await raw.open();assert.equal(JSON.stringify((await freezeNextOperation(raw)).frozenRequest),frozen)
 await db.lancamentos.update(id,{valor:20.50})
 await acceptOperationReceipt(raw,op,receipt(op))
 assert.equal((await raw.lancamentos.get(id)).valor,20.50);assert.equal((await raw.lancamentos.get(id)).syncStatus,'pending')
 const next=await freezeNextOperation(raw);assert.equal(next.frozenRequest.p_changes[0].baseRevision,100);assert.equal(next.frozenRequest.p_changes[0].payload.valor,2050)
 await acceptOperationReceipt(raw,next,receipt(next,101))
 assert.equal((await raw.lancamentos.get(id)).syncStatus,'synced');assert.equal((await raw.lancamentos.get(id)).valor,20.50)
})
test('recibo incompleto e conflito conservam alterações e bloqueiam operações dependentes',async t=>{
 const {raw,db}=await setup(t);const id=await db.lancamentos.add(entry());const op=await freezeNextOperation(raw)
 await db.lancamentos.update(id,{valor:15})
 await assert.rejects(acceptOperationReceipt(raw,op,{status:'applied',mutationId:op.mutationId,records:[]}),/incompleto/)
 assert.equal((await raw.outbox.get(op.sequence)).status,'sending')
 await acceptOperationReceipt(raw,op,{status:'conflict',mutationId:op.mutationId,conflicts:[{}]})
 assert.equal((await raw.lancamentos.get(id)).valor,15);assert.equal(await freezeNextOperation(raw),null)
})
test('pull interrompido não altera base/cursor; manifesto inválido é recusado; UUIDs resolvem IDs locais',async t=>{
 const {raw,household}=await setup(t),category=randomUUID(),launch=randomUUID()
 const cat={household_id:household,table_name:'categorias',uuid:category,revision:1,payload:{uuid:category,nome:'Casa'}}
 const row={household_id:household,table_name:'lancamentos',uuid:launch,revision:2,payload:{uuid:launch,valor:1250,categoriaUuid:category,deletedAt:null}}
 await assert.rejects(stageAndApplyPull(raw,async cursor=>{if(cursor===0)return page(household,0,2,[cat],1,true);throw new Error('offline')},household),/offline/)
 assert.equal(await raw.categorias.count(),0);assert.equal(await raw.syncState.get('cursor'),undefined)
 await assert.rejects(stageAndApplyPull(raw,async()=>({...page(household,0,2,[cat,row]),tables:['categorias']}),household),/Manifesto/)
 await stageAndApplyPull(raw,async cursor=>cursor===0?page(household,0,2,[cat],1,true):page(household,1,2,[row]),household)
 const stored=await raw.lancamentos.where('uuid').equals(launch).first(),storedCat=await raw.categorias.where('uuid').equals(category).first()
 assert.equal(stored.valor,12.50);assert.equal(stored.categoriaId,storedCat.id);assert.equal((await raw.syncState.get('cursor')).value,2)
})
test('pull não sobrescreve edição offline e mantém cópia remota para revisão',async t=>{
 const {raw,db,household}=await setup(t),a=entry();const id=await db.lancamentos.add(a)
 const remote={household_id:household,table_name:'lancamentos',uuid:a.uuid,revision:1,payload:{...a,valor:1000}}
 await stageAndApplyPull(raw,async()=>page(household,0,1,[remote]),household)
 assert.equal((await raw.lancamentos.get(id)).valor,10.25);assert.equal((await raw.syncState.get('remote:lancamentos:'+a.uuid)).value.payload.valor,1000)
 assert.equal(await raw.outbox.count(),1)
})
test('leitor concorrente que falha não apaga páginas do outro leitor',async t=>{
 const {raw,household}=await setup(t),category=randomUUID(),launch=randomUUID()
 const cat={household_id:household,table_name:'categorias',uuid:category,revision:1,payload:{uuid:category,nome:'Casa'}}
 const row={household_id:household,table_name:'lancamentos',uuid:launch,revision:2,payload:{uuid:launch,valor:1250,categoriaUuid:category}}
 let release,started;const gate=new Promise(r=>release=r),firstPageStaged=new Promise(r=>started=r)
 const first=stageAndApplyPull(raw,async after=>{if(after===0)return page(household,0,2,[cat],1,true);started();await gate;return page(household,1,2,[row])},household)
 await firstPageStaged
 await assert.rejects(stageAndApplyPull(raw,async()=>{throw new Error('offline in another tab')},household),/offline/)
 release();await first
 assert.equal(await raw.categorias.count(),1);assert.equal(await raw.lancamentos.count(),1)
 assert.ok((await raw.lancamentos.toArray())[0].categoriaId)
})
