import {BUSINESS_TABLES,toLocalRecord} from './localOutbox.js'
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
export function applyIntent(base,local,remote){
 if(!base)return {...remote,...local}
 const next={...remote}
 for(const field of new Set([...Object.keys(base),...Object.keys(local)]))if(!same(base[field],local[field])){
  if(local[field]===undefined)delete next[field];else next[field]=local[field]
 }
 return next
}
// Server snapshots shown to the user must be refreshed before calling this.
// Never edits a frozen request or reuses a mutation ID with changed contents.
export async function resolveCloudConflict(raw,sequence,choice,remoteRecords){
 if(!['local','server'].includes(choice))throw new Error('Escolha inválida.')
 return raw.transaction('rw',[...BUSINESS_TABLES.map(t=>raw.table(t)),raw.outbox,raw.syncReceipts,raw.syncState],async()=>{
  const op=await raw.outbox.get(sequence)
  if(op?.status!=='conflict')throw new Error('O conflito mudou. Atualize a conferência.')
  const snapshots=op.changes.map(c=>remoteRecords.find(r=>r.table_name===c.table&&r.uuid===c.uuid)||{table_name:c.table,uuid:c.uuid,revision:0,payload:null})
  if(remoteRecords.some(r=>r.household_id!==op.householdId))throw new Error('Snapshot de outra base.')
  const pending=(await raw.outbox.toArray()).filter(o=>o.sequence>op.sequence&&o.status!=='applied')
  const history=[...(op.resolutionHistory||[]),{mutationId:op.mutationId,frozenRequest:op.frozenRequest,result:op.result,choice,at:new Date().toISOString()}]
  const rebased=new Map()
  if(choice==='local'){
   const newId=crypto.randomUUID()
   const changes=op.changes.map((c,i)=>({...c,baseRevision:snapshots[i].revision,dependsOn:null,basePayload:snapshots[i].payload,payload:applyIntent(c.basePayload,c.payload,snapshots[i].payload||{})}))
   await raw.outbox.update(sequence,{mutationId:newId,status:'pending',changes,frozenRequest:null,result:null,resolutionHistory:history})
   for(const c of changes)rebased.set(op.mutationId+':'+c.table+':'+c.uuid,{id:newId,payload:c.payload})
  }else{
   const receipt=await raw.syncReceipts.get(op.mutationId)
   await raw.syncReceipts.put({...receipt,mutationId:op.mutationId,result:receipt?.result||op.result,resolution:{choice:'server',records:snapshots}})
   const catalogs=Object.fromEntries(await Promise.all(BUSINESS_TABLES.map(async t=>[t,await raw.table(t).toArray()])))
   for(const remote of snapshots){
    const current=await raw.table(remote.table_name).where('uuid').equals(remote.uuid).first()
    if(!current)throw new Error('Registro local não encontrado para revisão.')
    if(pending.some(o=>o.changes.some(c=>c.table===remote.table_name&&c.uuid===remote.uuid)))await raw.table(remote.table_name).update(current.id,{_serverRevision:remote.revision})
    else if(remote.payload)await raw.table(remote.table_name).put(toLocalRecord(remote,catalogs,current))
    else await raw.table(remote.table_name).update(current.id,{deletedAt:new Date().toISOString(),_serverRevision:0,syncStatus:'synced',_discardedLocal:true})
   }
   await raw.outbox.update(sequence,{status:'applied',resolutionHistory:history,resolution:'server'})
   for(const r of snapshots)rebased.set(op.mutationId+':'+r.table_name+':'+r.uuid,{id:op.mutationId,payload:r.payload})
  }
  // Reapply each later action's own field changes, rather than reviving fields
  // discarded by the user's choice. Propagate through the full dependency chain.
  for(const later of pending.sort((a,b)=>a.sequence-b.sequence)){
   let changed=false
   const changes=later.changes.map(c=>{
    const parent=rebased.get(c.dependsOn+':'+c.table+':'+c.uuid)
    if(!parent)return c
    changed=true
    const payload=applyIntent(parent.payload?c.basePayload:null,c.payload,parent.payload||{})
    rebased.set(later.mutationId+':'+c.table+':'+c.uuid,{id:later.mutationId,payload})
    return {...c,dependsOn:parent.id,basePayload:parent.payload,payload}
   })
   if(!changed)continue
   if(later.frozenRequest)throw new Error('Uma operação dependente já foi enviada. A revisão foi bloqueada para preservar a fila.')
   await raw.outbox.update(later.sequence,{changes})
  }
  const catalogs=Object.fromEntries(await Promise.all(BUSINESS_TABLES.map(async t=>[t,await raw.table(t).toArray()])))
  for(const c of op.changes){
   const tail=pending.filter(o=>o.changes.some(x=>x.table===c.table&&x.uuid===c.uuid)).at(-1)
   const active=tail?await raw.outbox.get(tail.sequence):choice==='local'?await raw.outbox.get(sequence):null
   const last=active?.changes.find(x=>x.table===c.table&&x.uuid===c.uuid)
   if(!last)continue
   const current=await raw.table(c.table).where('uuid').equals(c.uuid).first()
   if(current?._localVersion===last.localVersion)await raw.table(c.table).put({...toLocalRecord({payload:last.payload,revision:current._serverRevision},catalogs,current),syncStatus:'pending'})
  }
 })
}
