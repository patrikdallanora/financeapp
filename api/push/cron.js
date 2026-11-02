import {createHash,timingSafeEqual} from 'node:crypto'
import webPush from 'web-push'
import {calcularAlertas,hojeISO} from '../../lib/alertasFinanceiros.js'
import {serverDatabase,cloudFinancialData} from '../../lib/cloudServer.js'
import {MIGRATION_CAPTURE_MODE,MIGRATION_MESSAGE} from '../../lib/migrationMode.js'
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 if(MIGRATION_CAPTURE_MODE)return res.status(200).json({sucesso:true,notificou:false,pausado:true,motivo:MIGRATION_MESSAGE})
 return enviarAlertasProgramados(req,res)
}
const authorized=(received,secret)=>{const a=Buffer.from(String(received||'')),b=Buffer.from(secret?'Bearer '+secret:'');return b.length>0&&a.length===b.length&&timingSafeEqual(a,b)}
export async function enviarAlertasProgramados(req,res,options={}){
 if(!authorized(req.headers?.authorization,options.cronSecret||process.env.CRON_SECRET))return res.status(401).json({erro:'Não autorizado.'})
 if(req.method&&req.method!=='GET')return res.status(405).json({erro:'Método não permitido.'})
 try{
  const database=options.database||serverDatabase()
  const targets=await database.rpc('financeapp_service_push_targets')
  if(targets.error)throw targets.error
  let enviados=0,falhas=0,ignorados=0,prontos=0
  for(const [household,subscriptions]of Map.groupBy(targets.data||[],s=>s.household_id)){
   const finance=await cloudFinancialData(database,household),alerts=calcularAlertas(finance)
   if(!alerts.deveNotificar){ignorados+=subscriptions.length;continue}
   const day=hojeISO(),key='daily:'+day,payload={title:alerts.titulo,body:alerts.corpo,icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',url:'/',tag:'financeapp-alertas-'+day,requireInteraction:false}
   const payloadText=JSON.stringify(payload),digest=createHash('sha256').update(payloadText).digest('hex')
   if(req.query?.dryRun==='1'){prontos+=subscriptions.length;continue}
   if(!options.send)webPush.setVapidDetails(process.env.VAPID_SUBJECT,process.env.VITE_VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY)
   for(const s of subscriptions){
    const args={p_household:household,p_device:s.device_id,p_key:key}
    const claim=await database.rpc('financeapp_service_claim_notification',{...args,p_hash:digest})
    if(claim.error)throw claim.error
    if(!claim.data){ignorados++;continue}
    let status='sent',code=null
    try{
     const subscription={endpoint:s.endpoint,keys:{p256dh:s.p256dh_key,auth:s.auth_key}}
     await (options.send?options.send(subscription,payloadText):webPush.sendNotification(subscription,payloadText));enviados++
    }catch(error){
     falhas++;code=Number(error.statusCode)||null;status=code?'failed':'uncertain'
     if([404,410].includes(code))await database.rpc('financeapp_service_expire_push',{p_endpoint_sha256:s.endpoint_sha256})
    }
    const finish=await database.rpc('financeapp_service_finish_notification',{...args,p_status:status,p_error:code})
    if(finish.error)throw finish.error
   }
  }
  return res.status(200).json({sucesso:true,notificou:enviados>0,enviados,falhas,ignorados,prontos,dryRun:req.query?.dryRun==='1'})
 }catch{return res.status(500).json({sucesso:false,erro:'Não foi possível concluir os alertas. Os recibos de tentativas foram preservados.'})}
}
