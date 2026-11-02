import {getCloudClient} from '../sync/cloudClient.js'
export function notificationStatus(){const supported=typeof window!=='undefined'&&'Notification'in window&&'serviceWorker'in navigator&&'PushManager'in window;return {suportado:supported,permissao:supported?Notification.permission:'unsupported',ativo:supported&&Notification.permission==='granted'&&localStorage.getItem('financeapp_notificacoes_ativas')==='true'&&localStorage.getItem('financeapp_cloud_push_registered')==='true'}}
async function saveExisting(subscription){
 const {data,error}=await getCloudClient().auth.getSession();if(error||!data.session)throw new Error('Entre na conta para ativar as notificações.')
 const response=await fetch('/api/push/subscription',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({deviceId:localStorage.getItem('financeapp_device_id'),subscription:subscription.toJSON()})})
 if(!response.ok)throw new Error('Não foi possível registrar as notificações. Tente atualizar novamente com internet.')
 localStorage.setItem('financeapp_notificacoes_ativas','true');localStorage.setItem('financeapp_cloud_push_registered','true')
}
export async function rebindExistingPush(){
 if(!notificationStatus().suportado||Notification.permission!=='granted'||localStorage.getItem('financeapp_notificacoes_ativas')!=='true')return false
 const registration=await navigator.serviceWorker.ready,subscription=await registration.pushManager.getSubscription()
 if(!subscription)return false
 try{await saveExisting(subscription);return true}catch{localStorage.setItem('financeapp_cloud_push_registered','false');return false}
}
export async function enableCloudNotifications(){
 if(!notificationStatus().suportado)throw new Error('Abra pelo ícone instalado do FinanceApp para usar notificações neste iPhone.')
 if(Notification.permission!=='granted'&&await Notification.requestPermission()!=='granted')throw new Error('A permissão de notificações não foi concedida.')
 const registration=await navigator.serviceWorker.ready
 let subscription=await registration.pushManager.getSubscription()
 if(!subscription){const value=import.meta.env.VITE_VAPID_PUBLIC_KEY;if(!value)throw new Error('As notificações ainda não estão configuradas.');const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/'));subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(raw,c=>c.charCodeAt(0))})}
 await saveExisting(subscription);return {sucesso:true}
}
export async function testCloudNotification(){
 if(!notificationStatus().ativo)throw new Error('Ative as notificações primeiro.')
 await (await navigator.serviceWorker.ready).showNotification('FinanceApp',{body:'Notificações habilitadas neste aparelho.',icon:'/icons/icon-192.png',tag:'financeapp-teste-local',data:{url:'/'}})
}
export async function disableCloudNotifications(){
 if(!notificationStatus().suportado)return
 const registration=await navigator.serviceWorker.ready,subscription=await registration.pushManager.getSubscription()
 let disabled=!subscription
 try{const {data}=await getCloudClient().auth.getSession();if(data.session){const r=await fetch('/api/push/subscription',{method:'DELETE',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({deviceId:localStorage.getItem('financeapp_device_id')})});disabled||=r.ok}}catch{}
 if(subscription)try{disabled=await subscription.unsubscribe()||disabled}catch{}
 if(!disabled)throw new Error('Conecte à internet para concluir a saída com os alertas deste aparelho desativados.')
 localStorage.setItem('financeapp_notificacoes_ativas','false');localStorage.setItem('financeapp_cloud_push_registered','false')
}
