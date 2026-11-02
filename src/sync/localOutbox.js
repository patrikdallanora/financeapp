import Dexie from 'dexie'
import { encode } from '../backup/backupCodec.js'
import { normalizeBusinessRecord } from '../backup/semanticComparison.js'

export const BUSINESS_TABLES=['usuarios','cartoes','categorias','subcategorias','lancamentos','faturas','metas']
export const SYNC_STORES={outbox:'++sequence,&mutationId,status',syncState:'&key',syncReceipts:'&mutationId',syncInbox:'&[jobId+revision],jobId,revision,table_name,uuid'}
const money=['valor','limite','valorAlvo','faturaValorPago']
const relations={usuario:'usuarios',cartao:'cartoes',categoria:'categorias',subcategoria:'subcategorias'}
const same=(a,b)=>JSON.stringify(encode(a))===JSON.stringify(encode(b))

export function toCanonicalRecord(record,catalogs){
 const source={...record}
 for(const key of Object.keys(source))if(key.startsWith('_'))delete source[key]
 for(const [prefix,table] of Object.entries(relations)){
  const id=source[prefix+'Id'],explicit=source[prefix+'Uuid']
  if(!explicit&&id!=null&&id!==''){
   const rows=catalogs[table].filter(r=>r.id===id)
   if(rows.length!==1)throw new Error('Vínculo local inválido: '+prefix)
   source[prefix+'Uuid']=rows[0].uuid
  }
  delete source[prefix+'Id']
 }
 const canonical=normalizeBusinessRecord(source)
 canonical.deletedAt=record.deletedAt||null
 return canonical
}

export function toLocalRecord(remote,catalogs,previous){
 const record={...remote.payload}
 for(const field of money)if(record[field]!=null)record[field]/=100
 for(const [prefix,table]of Object.entries(relations))record[prefix+'Id']=record[prefix+'Uuid']?catalogs[table].find(r=>r.uuid===record[prefix+'Uuid'])?.id??null:null
 return {...record,...(previous?{id:previous.id}:{}),_serverRevision:remote.revision,_localVersion:previous?._localVersion||0,updatedAt:remote.updated_at||new Date().toISOString(),syncStatus:'synced'}
}

// Facade centralizes all current screen writes without using collection hooks.
// Business changes and their complete operation share one IndexedDB transaction.
export function createOutboxFacade(raw){
 const tables=new Map(),capturing=new WeakSet()
 const currentCapturing=()=>Dexie.currentTransaction&&capturing.has(Dexie.currentTransaction)
 const stores=()=>[...BUSINESS_TABLES.map(t=>raw.table(t)),raw.outbox,raw.syncState,raw.syncReceipts]
 async function atomic(names,operation){
  if(currentCapturing())return operation()
  return raw.transaction('rw',stores(),async()=>{
   const context=await raw.syncState.get('context')
   if(!context?.ready||!context.householdId||!context.deviceId)throw new Error('A base ainda não terminou de sincronizar.')
   const tx=Dexie.currentTransaction;capturing.add(tx)
   try {
    const before=Object.fromEntries(await Promise.all(names.map(async t=>[t,await raw.table(t).toArray()])))
    const result=await operation()
    const catalogs=Object.fromEntries(await Promise.all(BUSINESS_TABLES.map(async t=>[t,await raw.table(t).toArray()])))
    const pending=(await raw.outbox.orderBy('sequence').toArray()).filter(o=>o.status!=='applied')
    const changes=[]
    for(const table of names){
     const oldRows=new Map(before[table].map(r=>[r.uuid,r]))
     if(before[table].some(r=>!catalogs[table].some(n=>n.uuid===r.uuid)))throw new Error('Exclusão física bloqueada. Use a exclusão preservada.')
     for(const row of catalogs[table]){
      const old=oldRows.get(row.uuid)
      if(same(row,old))continue
      if(!row.uuid||catalogs[table].filter(r=>r.uuid===row.uuid).length!==1)throw new Error('Identidade local inválida ou duplicada.')
      const payload=toCanonicalRecord(row,catalogs)
      if(old&&same(payload,toCanonicalRecord(old,catalogs)))continue
      const predecessor=pending.findLast(o=>o.changes.some(c=>c.table===table&&c.uuid===row.uuid))
      const localVersion=(old?._localVersion||0)+1
      changes.push({table,uuid:row.uuid,payload,localVersion,baseRevision:predecessor?null:old?._serverRevision||0,dependsOn:predecessor?.mutationId||null})
      await raw.table(table).update(row.id,{_localVersion:localVersion,_serverRevision:old?._serverRevision||0,syncStatus:'pending'})
     }
    }
    if(changes.length){
     if(changes.length>500)throw new Error('A ação excedeu o limite seguro de registros.')
     await raw.outbox.add({mutationId:crypto.randomUUID(),householdId:context.householdId,deviceId:context.deviceId,status:'pending',createdAt:new Date().toISOString(),changes})
    }
    return result
   }finally{capturing.delete(tx)}
  })
 }
 const mutations=new Set(['add','put','update','bulkAdd','bulkPut'])
 const forbidden=new Set(['delete','bulkDelete','clear'])
 function tableProxy(name){
  if(!BUSINESS_TABLES.includes(name))return raw.table(name)
  if(!tables.has(name))tables.set(name,new Proxy(raw.table(name),{get(table,prop){
   if(forbidden.has(prop))return()=>{throw new Error('Exclusão física bloqueada. Use a exclusão preservada.')}
   if(mutations.has(prop))return(...args)=>atomic([name],()=>table[prop](...args))
   const value=Reflect.get(table,prop,table);return typeof value==='function'?value.bind(table):value
  }}))
  return tables.get(name)
 }
 const db=new Proxy(raw,{get(target,prop){
  if(BUSINESS_TABLES.includes(prop))return tableProxy(prop)
  if(prop==='table')return tableProxy
  if(prop==='transaction')return(mode,...args)=>{
   const operation=args.pop(),supplied=args.flat(),names=[...new Set(supplied.map(t=>typeof t==='string'?t:t.name).filter(t=>BUSINESS_TABLES.includes(t)))]
   return String(mode).startsWith('rw')&&names.length?atomic(names,operation):raw.transaction(mode,...supplied.map(t=>typeof t==='string'?raw.table(t):raw.table(t.name)),operation)
  }
  const value=Reflect.get(target,prop,target);return typeof value==='function'?value.bind(target):value
 }})
 return {db,atomic}
}

export async function freezeNextOperation(raw){
 return raw.transaction('rw',raw.outbox,raw.syncReceipts,async()=>{
  const op=(await raw.outbox.orderBy('sequence').toArray()).find(o=>o.status!=='applied')
  if(!op||op.status==='conflict')return null
  if(op.frozenRequest)return op
  const changes=[]
  for(const c of op.changes){
   let revision=c.baseRevision
   if(c.dependsOn){
    const receipt=await raw.syncReceipts.get(c.dependsOn)
    if(receipt?.result.status!=='applied')return null
    const previous=receipt.result.records.find(r=>r.table_name===c.table&&r.uuid===c.uuid)
    if(!previous)throw new Error('Recibo anterior incompleto.')
    revision=previous.revision
   }
   changes.push({table:c.table,uuid:c.uuid,baseRevision:revision,payload:c.payload})
  }
  const frozenRequest={p_household:op.householdId,p_mutation:op.mutationId,p_device:op.deviceId,p_protocol:1,p_changes:changes}
  await raw.outbox.update(op.sequence,{status:'sending',frozenRequest})
  return {...op,status:'sending',frozenRequest}
 })
}

export async function acceptOperationReceipt(raw,op,result){
 if(result.mutationId!==op.mutationId||!['applied','conflict'].includes(result.status))throw new Error('Recibo de sincronização inválido.')
 if(result.status==='applied'&&(!Array.isArray(result.records)||result.records.length!==op.changes.length||op.changes.some(c=>result.records.filter(r=>r.table_name===c.table&&r.uuid===c.uuid&&Number.isSafeInteger(r.revision)&&r.revision>0).length!==1)))throw new Error('Recibo incompleto.')
 await raw.transaction('rw',[...BUSINESS_TABLES.map(t=>raw.table(t)),raw.outbox,raw.syncReceipts],async()=>{
  const existing=await raw.outbox.get(op.sequence)
  if(!existing||existing.mutationId!==op.mutationId)throw new Error('Operação local não encontrada.')
  if(existing.status==='applied')return
  await raw.syncReceipts.put({mutationId:op.mutationId,result})
  if(result.status==='conflict'){await raw.outbox.update(op.sequence,{status:'conflict',result});return}
  const catalogs=Object.fromEntries(await Promise.all(BUSINESS_TABLES.map(async t=>[t,await raw.table(t).toArray()])))
  for(const remote of result.records){
   const change=op.changes.find(c=>c.table===remote.table_name&&c.uuid===remote.uuid)
   const current=await raw.table(remote.table_name).where('uuid').equals(remote.uuid).first()
   if(!current)throw new Error('Registro local ausente ao confirmar.')
   if(current._localVersion===change.localVersion)await raw.table(remote.table_name).put(toLocalRecord(remote,catalogs,current))
   else await raw.table(remote.table_name).update(current.id,{_serverRevision:remote.revision})
  }
  await raw.outbox.update(op.sequence,{status:'applied',result,confirmedAt:new Date().toISOString()})
 })
}

export async function stageAndApplyPull(raw,fetchPage,householdId){
 const state=await raw.syncState.get('cursor'),start=state?.value||0
 const jobId=crypto.randomUUID()
 let cursor=start,target=null,pages=0,committedCursor
 // Each reader stages separately: another tab cannot erase an unfinished pull.
 try {
 do {
  const page=await fetchPage(cursor)
  if(page.protocol!==1||page.householdId!==householdId||page.after!==cursor||!Array.isArray(page.tables)||[...page.tables].sort().join()!==[...BUSINESS_TABLES].sort().join()||!Array.isArray(page.records)||!Number.isSafeInteger(page.head)||page.head<cursor||!Number.isSafeInteger(page.next)||page.next<cursor||page.next>page.head||typeof page.more!=='boolean')throw new Error('Manifesto de sincronização inválido.')
  target??=page.head
  let last=cursor
  for(const row of page.records){if(row.household_id!==householdId||!BUSINESS_TABLES.includes(row.table_name)||!row.uuid||row.payload?.uuid!==row.uuid||!Number.isSafeInteger(row.revision)||row.revision<=last||row.revision>page.next)throw new Error('Página de sincronização inválida.');last=row.revision}
  if(page.next===cursor&&cursor<target)throw new Error('A leitura não avançou.')
  await raw.syncInbox.bulkPut(page.records.filter(r=>r.revision<=target).map(r=>({...r,jobId})))
  cursor=Math.min(page.next,target)
  if(++pages>10000)throw new Error('Limite seguro da leitura excedido.')
 }while(cursor<target)
 await raw.transaction('rw',[...BUSINESS_TABLES.map(t=>raw.table(t)),raw.outbox,raw.syncInbox,raw.syncState],async()=>{
  const currentCursor=(await raw.syncState.get('cursor'))?.value
  if(currentCursor!==undefined&&currentCursor>=target){await raw.syncInbox.where('jobId').equals(jobId).delete();committedCursor=currentCursor;return}
  const rows=await raw.syncInbox.where('jobId').equals(jobId).sortBy('revision'),pending=(await raw.outbox.toArray()).filter(o=>o.status!=='applied')
  const latest=new Map(rows.map(r=>[r.table_name+':'+r.uuid,r]))
  for(const table of BUSINESS_TABLES){
   const list=[...latest.values()].filter(r=>r.table_name===table)
   if(table==='usuarios')list.sort((a,b)=>(a.payload.nome==='PK'?-1:b.payload.nome==='PK'?1:0))
   const catalogs=Object.fromEntries(await Promise.all(BUSINESS_TABLES.map(async t=>[t,await raw.table(t).toArray()])))
   for(const remote of list){
    const current=await raw.table(table).where('uuid').equals(remote.uuid).first()
    if(pending.some(o=>o.changes.some(c=>c.table===table&&c.uuid===remote.uuid))){
     await raw.syncState.put({key:'remote:'+table+':'+remote.uuid,value:remote});continue
    }
    await raw.table(table).put(toLocalRecord(remote,catalogs,current))
   }
  }
  await raw.syncState.put({key:'cursor',value:target})
  const context=await raw.syncState.get('context')
  await raw.syncState.put({...context,key:'context',householdId,ready:true})
  await raw.syncInbox.where('jobId').equals(jobId).delete()
  committedCursor=target
 })
 return committedCursor
 } finally {
  // Discard only this read attempt's staging, never data or another reader.
  await raw.syncInbox.where('jobId').equals(jobId).delete().catch(()=>{})
 }
}
