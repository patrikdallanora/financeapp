import {useEffect,useState} from 'react'
import {getCloudClient} from '../sync/cloudClient.js'
import {initializeCloudSession} from '../sync/cloudSyncManager.js'
import {cloudDatabase} from '../db/cloudDatabase.js'
import {cloudBackup} from '../backup/cloudBackup.js'
import {rebindExistingPush} from '../services/cloudNotifications.js'

export default function CloudAccessGate({children}){
 const [session,setSession]=useState(null),[ready,setReady]=useState(false),[checking,setChecking]=useState(true),[error,setError]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0)
 useEffect(()=>{let active=true;getCloudClient().auth.getSession().then(({data})=>{if(active){setSession(data.session);setChecking(false)}}).catch(e=>{if(active){setError(e.message);setChecking(false)}});const {data}=getCloudClient().auth.onAuthStateChange((_event,s)=>{if(active)setSession(s)});return()=>{active=false;data.subscription.unsubscribe()}},[])
 useEffect(()=>{
  let active=true
  async function prepare(){
   setChecking(true);setError('');setReady(false)
   const cached=await cloudDatabase.raw.syncState.get('context')
   try{
    if(!navigator.onLine){if(cached?.ready&&cached.activated&&!cached.authLocked){await cloudBackup.ensureInitial();if(active)setReady(true);return}throw new Error('Conecte à internet para concluir o primeiro acesso. Seus dados estão preservados.')}
    if(!session)return
    const result=await initializeCloudSession(session)
    if(result.paused)throw new Error('A liberação da nova sincronização ainda está em preparação. Seus dados continuam preservados.')
    await cloudBackup.ensureInitial()
    rebindExistingPush().catch(()=>{})
    if(active)setReady(true)
   }catch(e){
    const networkError=/fetch|network|abort/i.test(String(e.message))
    if(networkError&&cached?.ready&&cached.activated&&!cached.authLocked&&cached.authUserId===session?.user?.id){if(active)setReady(true)}
    else if(active)setError(e.message)
   }finally{if(active)setChecking(false)}
  }
  prepare();return()=>{active=false}
 },[session?.user?.id,attempt])
 if(ready)return children
 const button='min-h-[48px] w-full rounded-xl border border-[#3AF2A1]/40 p-3 font-bold text-[#3AF2A1] disabled:opacity-40'
 async function signIn(event){event.preventDefault();setBusy(true);setError('');try{const {data,error}=await getCloudClient().auth.signInWithPassword({email:email.trim(),password});if(error)throw error;setPassword('');setSession(data.session);setAttempt(n=>n+1)}catch(e){setError(/Invalid login/i.test(e.message)?'E-mail ou senha incorretos. Use o acesso criado durante a conferência.':e.message)}finally{setBusy(false)}}
 return <main className="min-h-screen space-y-5 bg-black px-5 py-8 text-white"><p className="text-sm font-bold text-[#3AF2A1]">FinanceApp</p><h1 className="text-2xl font-bold">Sua base financeira</h1>
  {checking?<p role="status">Conferindo acesso e preparando seus dados…</p>:!session?<form onSubmit={signIn} className="space-y-3"><label className="block text-sm">E-mail<input required type="email" autoComplete="username" className="mt-2 min-h-[48px] w-full rounded-xl bg-[#07140D] px-3" value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="block text-sm">Senha<input required type="password" autoComplete="current-password" className="mt-2 min-h-[48px] w-full rounded-xl bg-[#07140D] px-3" value={password} onChange={e=>setPassword(e.target.value)}/></label><button className={button} disabled={busy}>{busy?'Entrando…':'Entrar'}</button></form>:<button className={button} onClick={()=>setAttempt(n=>n+1)}>Tentar novamente</button>}
  {error&&<p role="alert" className="text-sm leading-6 text-amber-300">{error}</p>}
  <p className="text-sm leading-6 text-[#91A99C]">Os dados anteriores continuam preservados. Não reinstale o app nem limpe os dados do Safari para corrigir uma falha de conexão.</p>
 </main>
}
