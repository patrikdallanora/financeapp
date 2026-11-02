import {createClient} from '@supabase/supabase-js'
let client
export function serverDatabase(){
 if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY)throw new Error('Backend Supabase não configurado.')
 return client??=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
}
export async function requireCloudMember(req,database=serverDatabase()){
 const header=String(req.headers?.authorization||'')
 if(!header.startsWith('Bearer '))throw Object.assign(new Error('Não autorizado.'),{status:401})
 const {data,error}=await database.auth.getUser(header.slice(7))
 if(error||!data?.user)throw Object.assign(new Error('Sessão inválida.'),{status:401})
 const memberships=await database.rpc('financeapp_service_memberships',{p_user:data.user.id})
 if(memberships.error)throw memberships.error
 if(memberships.data?.length!==1)throw Object.assign(new Error('Base não autorizada.'),{status:403})
 return {user:data.user,household:memberships.data[0]}
}
export function subscriptionValid(value){
 try{
  const url=new URL(value.endpoint),hosts=['web.push.apple.com','fcm.googleapis.com','updates.push.services.mozilla.com','push.services.mozilla.com']
  return url.protocol==='https:'&&!url.username&&!url.password&&hosts.includes(url.hostname)&&url.port===''&&url.href.length<=4096&&/^[A-Za-z0-9_-]{80,120}={0,2}$/.test(value.keys?.p256dh||'')&&/^[A-Za-z0-9_-]{20,40}={0,2}$/.test(value.keys?.auth||'')
 }catch{return false}
}
export async function cloudFinancialData(database,household){
 const groups={lancamentos:[],cartoes:[]}
 for(const table of Object.keys(groups))for(let offset=0;;offset+=1000){
  const {data,error}=await database.from('financeapp_records').select('payload').eq('household_id',household).eq('table_name',table).order('uuid').range(offset,offset+999)
  if(error)throw error
  groups[table].push(...data.map(({payload})=>{const r={...payload};for(const f of ['valor','limite','valorAlvo','faturaValorPago'])if(r[f]!=null)r[f]/=100;return r}))
  if(data.length<1000)break
 }
 return groups
}
