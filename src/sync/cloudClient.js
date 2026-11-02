import {createClient} from '@supabase/supabase-js'
import {cloudDatabase} from '../db/cloudDatabase.js'
import {stageAndApplyPull} from './localOutbox.js'
let client
export const cloudConfigured=()=>Boolean(import.meta.env.VITE_SUPABASE_URL&&import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
export function getCloudClient(){
 if(!cloudConfigured())throw new Error('A conexão com a nova base ainda não está disponível nesta versão.')
 return client??=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{storageKey:'financeapp_supabase_session',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})
}
export async function getAuthorizedHousehold(){
 const {data,error}=await getCloudClient().from('financeapp_households').select('id,name,sync_enabled')
 if(error)throw error
 if(data?.length!==1)throw new Error('Este e-mail ainda não tem acesso à base familiar. Use o e-mail autorizado e confirme o cadastro.')
 return data[0]
}
export async function downloadCloudForReview(deviceId){
 const household=await getAuthorizedHousehold(),raw=cloudDatabase.raw
 await raw.open()
 const context=await raw.syncState.get('context')
 if(context?.householdId&&context.householdId!==household.id)throw new Error('Há dados de outra base neste aparelho. A troca foi bloqueada para preservá-los.')
 await raw.syncState.put({...context,key:'context',householdId:household.id,deviceId,ready:context?.ready||false})
 await stageAndApplyPull(raw,async after=>{
  const {data,error}=await getCloudClient().rpc('financeapp_pull_changes',{p_household:household.id,p_after:after,p_limit:200})
  if(error)throw error
  return data
 },household.id)
 const {data:status,error}=await getCloudClient().rpc('financeapp_migration_status',{p_household:household.id,p_device:deviceId})
 if(error)throw error
 const tables=Object.fromEntries(await Promise.all(Object.keys(status.counts).map(async name=>[name,await raw.table(name).toArray()])))
 if(Object.entries(status.counts).some(([name,count])=>tables[name].length!==count))throw new Error('A conferência das quantidades não terminou. Os dados antigos continuam preservados. Tente atualizar novamente.')
 return {household,status,tables}
}
export async function confirmCloudReview(review,deviceId){
 const {error}=await getCloudClient().rpc('financeapp_confirm_migration_device',{p_household:review.household.id,p_device:deviceId,p_candidate:review.status.candidateSha256})
 if(error)throw error
 return downloadCloudForReview(deviceId)
}
