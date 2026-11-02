import {BUSINESS_TABLES,freezeNextOperation,acceptOperationReceipt,stageAndApplyPull} from './localOutbox.js'

export function createCloudSyncEngine({raw,rpc,authorize,onStatus=()=>{}}){
 let running=null,again=false
 const status={sincronizando:false,ultimaSincronizacao:null,ultimoErro:null,online:true}
 const notify=patch=>{Object.assign(status,patch);onStatus({...status})}
 async function once(){
  notify({sincronizando:true,ultimoErro:null})
  try{
   const context=await raw.syncState.get('context')
   if(!context?.householdId||!context?.deviceId)throw new Error('Entre na base antes de sincronizar.')
   const household=await authorize()
   if(household.id!==context.householdId)throw new Error('A sessão pertence a outra base. A fila local foi preservada.')
   for(let count=0;count<100;count++){
    const op=await freezeNextOperation(raw)
    if(!op)break
    if(op.householdId!==household.id||op.deviceId!==context.deviceId)throw new Error('Operação de outra base ou instalação. Nada foi enviado.')
    const result=await rpc('financeapp_apply_mutation',op.frozenRequest)
    await acceptOperationReceipt(raw,op,result)
    if(result.status==='conflict')break
   }
   await stageAndApplyPull(raw,after=>rpc('financeapp_pull_changes',{p_household:household.id,p_after:after,p_limit:200}),household.id)
   const time=new Date().toISOString()
   await raw.syncState.put({key:'lastSync',value:time})
   const conflicts=await raw.outbox.where('status').equals('conflict').count()
   notify({ultimaSincronizacao:time,ultimoErro:conflicts?'Há alterações em conflito aguardando revisão.':null,online:true})
   return {sucesso:true,conflitos:conflicts}
  }catch(error){notify({ultimoErro:error.message||'Não foi possível confirmar o envio. A fila local está preservada.'});throw error}
  finally{notify({sincronizando:false})}
 }
 function run(){
  if(running){again=true;return running}
  running=(async()=>{let result;do{again=false;result=await once()}while(again);return result})().finally(()=>{running=null})
  return running
 }
 return {run,getStatus:()=>({...status}),counts:async()=>{const ops=await raw.outbox.toArray();return {pendentes:ops.filter(o=>['pending','sending'].includes(o.status)).reduce((n,o)=>n+o.changes.length,0),conflitos:ops.filter(o=>o.status==='conflict').length}},tables:BUSINESS_TABLES}
}
