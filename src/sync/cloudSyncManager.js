import {cloudDatabase} from '../db/cloudDatabase.js'
import {getCloudClient,getAuthorizedHousehold} from './cloudClient.js'
import {createCloudSyncEngine} from './cloudSyncEngine.js'
import {resolveCloudConflict} from './resolveCloudConflict.js'
import {disableCloudNotifications} from '../services/cloudNotifications.js'
const raw=cloudDatabase.raw
export async function cloudRpc(name,args){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000)
 try{const {data,error}=await getCloudClient().rpc(name,args).abortSignal(controller.signal);if(error)throw error;return data}finally{clearTimeout(timer)}
}
const engine=createCloudSyncEngine({raw,rpc:cloudRpc,authorize:getAuthorizedHousehold,onStatus:()=>{if(typeof window!=='undefined')window.dispatchEvent(new Event('financeapp-sync-status'))}})
let started=false,interval,debounce,retry,retryDelay=1000
export const obterStatusSync=()=>({...engine.getStatus(),online:typeof navigator==='undefined'||navigator.onLine})
export const contarPendenciasSync=()=>engine.counts()
export async function initializeCloudSession(session){
 const household=await getAuthorizedHousehold(),old=await raw.syncState.get('context')
 if(old?.householdId&&old.householdId!==household.id)throw new Error('A base desta conta é diferente da cópia local. Os dados foram preservados.')
 if(!household.sync_enabled)return {paused:true}
 let deviceId=localStorage.getItem('financeapp_device_id')
 if(!deviceId){deviceId=crypto.randomUUID();localStorage.setItem('financeapp_device_id',deviceId)}
 await raw.syncState.put({...old,key:'context',householdId:household.id,deviceId,authUserId:session.user.id,authLocked:false,activated:true,ready:old?.ready||false})
 iniciarAutoSync()
 await engine.run()
 return {paused:false}
}
function scheduleRetry(){
 clearTimeout(retry)
 if(!started)return
 if(typeof navigator!=='undefined'&&!navigator.onLine)return
 retry=setTimeout(()=>executarSync(),retryDelay+Math.random()*retryDelay/4)
 retryDelay=Math.min(retryDelay*2,60000)
}
export async function executarSync(){
 try{
  const run=()=>engine.run()
  const result=typeof navigator!=='undefined'&&navigator.locks?await navigator.locks.request('financeapp-cloud-sync',run):await run()
  retryDelay=1000;clearTimeout(retry);return result
 }catch(error){scheduleRetry();return {sucesso:false,erro:error.message}}
}
export const executarPullInicial=executarSync
export const pushSync=executarSync
export const pullSync=executarSync
export const pullBatchSync=executarSync
export function agendarSync(){clearTimeout(debounce);debounce=setTimeout(()=>executarSync(),800)}
const resume=()=>{if(!document.hidden)agendarSync()}
export function iniciarAutoSync({executarAoIniciar=false}={}){
 if(started)return;started=true
 window.addEventListener('online',agendarSync);window.addEventListener('focus',agendarSync);window.addEventListener('financeapp-outbox-changed',agendarSync);document.addEventListener('visibilitychange',resume)
 interval=setInterval(()=>executarSync(),30000)
 if(executarAoIniciar)agendarSync()
}
export function pararAutoSync(){
 started=false;clearInterval(interval);clearTimeout(debounce);clearTimeout(retry)
 window.removeEventListener('online',agendarSync);window.removeEventListener('focus',agendarSync);window.removeEventListener('financeapp-outbox-changed',agendarSync);document.removeEventListener('visibilitychange',resume)
}
export async function signOutCloud(){await disableCloudNotifications();const context=await raw.syncState.get('context');await raw.syncState.put({...context,key:'context',authLocked:true});pararAutoSync();await getCloudClient().auth.signOut({scope:'local'})}
export async function restaurarBaseLocalDoSheets(){throw new Error('A restauração destrutiva foi desativada. Seus dados e operações pendentes estão preservados.')}
export async function conferirPagamentosServidor(){throw new Error('Use a sincronização e a revisão de conflitos da nova base.')}
export async function reenviarPagamentoConferido(){throw new Error('Use a revisão de conflitos. Não há reenvio de pagamento fora da fila transacional.')}
export async function loadConflictReview(sequence){
 await executarSync()
 const op=await raw.outbox.get(sequence)
 if(op?.status!=='conflict')throw new Error('O conflito mudou. Atualize a lista.')
 const snapshots=[]
 for(const change of op.changes){const {data,error}=await getCloudClient().from('financeapp_records').select('*').eq('household_id',op.householdId).eq('table_name',change.table).eq('uuid',change.uuid);if(error)throw error;if(data.length)snapshots.push(data[0])}
 return {op,snapshots}
}
export async function chooseConflictReview(review,choice){
 const fresh=await loadConflictReview(review.op.sequence)
 if(fresh.op.mutationId!==review.op.mutationId||review.op.changes.some(c=>(review.snapshots.find(r=>r.uuid===c.uuid&&r.table_name===c.table)?.revision||0)!==(fresh.snapshots.find(r=>r.uuid===c.uuid&&r.table_name===c.table)?.revision||0)))throw new Error('O servidor mudou depois da conferência. Atualize o conflito antes de escolher.')
 await resolveCloudConflict(raw,review.op.sequence,choice,fresh.snapshots);agendarSync()
}
