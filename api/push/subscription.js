import {MIGRATION_CAPTURE_MODE,MIGRATION_MESSAGE} from '../../lib/migrationMode.js'
import {serverDatabase,requireCloudMember,subscriptionValid} from '../../lib/cloudServer.js'
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 if(MIGRATION_CAPTURE_MODE)return res.status(503).json({erro:MIGRATION_MESSAGE})
 return registerSubscription(req,res)
}
export async function registerSubscription(req,res,database){
 if(!['POST','DELETE'].includes(req.method))return res.status(405).json({erro:'Método não permitido.'})
 if(!String(req.headers?.authorization||'').startsWith('Bearer '))return res.status(401).json({erro:'Não autorizado.'})
 try{
  database??=serverDatabase()
  const {user,household}=await requireCloudMember(req,database)
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body
  if(!/^[0-9a-f-]{36}$/i.test(body?.deviceId||''))return res.status(400).json({erro:'Inscrição inválida.'})
  if(req.method==='DELETE'){const {error}=await database.rpc('financeapp_service_disable_device_push',{p_household:household.household_id,p_user:user.id,p_device:body.deviceId});if(error)throw error;return res.status(200).json({sucesso:true})}
  if(!household.sync_enabled)return res.status(503).json({erro:'A sincronização ainda está pausada.'})
  if(!subscriptionValid(body?.subscription))return res.status(400).json({erro:'Inscrição inválida.'})
  const {error}=await database.rpc('financeapp_service_register_push',{p_household:household.household_id,p_user:user.id,p_device:body.deviceId,p_endpoint:body.subscription.endpoint,p_p256dh:body.subscription.keys.p256dh,p_auth:body.subscription.keys.auth})
  if(error)throw error
  return res.status(200).json({sucesso:true})
 }catch(e){return res.status(e.status||400).json({erro:e.status?'Acesso não autorizado.':'Não foi possível registrar as notificações.'})}
}
