import {useEffect,useState} from 'react'
import {cloudConfigured,getCloudClient,downloadCloudForReview,confirmCloudReview} from '../sync/cloudClient.js'

const errorText=error=>{
 const text=String(error?.message||error)
 if(/Invalid login credentials/i.test(text))return 'E-mail ou senha incorretos. Se acabou de criar o acesso, confirme o e-mail antes de entrar.'
 if(/Email not confirmed/i.test(text))return 'Confirme o cadastro pelo e-mail recebido e volte ao ícone do aplicativo para entrar.'
 if(/rate limit|too many/i.test(text))return 'O limite temporário de tentativas foi atingido. Aguarde antes de tentar novamente.'
 if(/fetch|network|failed to fetch/i.test(text))return 'Não foi possível conectar. Confira a internet e tente novamente; os dados antigos estão preservados.'
 return text
}
export default function CloudMigrationPanel(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[creating,setCreating]=useState(false)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[session,setSession]=useState(null),[review,setReview]=useState(null)
 const [month,setMonth]=useState(new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'}).slice(0,7)),[search,setSearch]=useState(''),[limit,setLimit]=useState(40)
 const [deviceId]=useState(()=>{
  let id=localStorage.getItem('financeapp_device_id')
  if(!id){id=crypto.randomUUID();localStorage.setItem('financeapp_device_id',id)}
  return id
 })
 const configured=cloudConfigured()
 useEffect(()=>{
  if(!configured)return
  let active=true
  getCloudClient().auth.getSession().then(({data})=>{if(active)setSession(data.session)})
  const {data}=getCloudClient().auth.onAuthStateChange((_event,value)=>{if(active)setSession(value)})
  return()=>{active=false;data.subscription.unsubscribe()}
 },[configured])
 async function refresh(){
  setBusy(true);setError('')
  try{setReview(await downloadCloudForReview(deviceId))}catch(e){setError(errorText(e))}finally{setBusy(false)}
 }
 useEffect(()=>{if(session)refresh()},[session?.user?.id])
 async function authenticate(event){
  event.preventDefault();setBusy(true);setError('');setMessage('')
  try{
   if(creating&&password!==repeat)throw new Error('As senhas precisam ser iguais.')
   const client=getCloudClient(),result=creating?await client.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:window.location.origin}}):await client.auth.signInWithPassword({email:email.trim(),password})
   if(result.error)throw result.error
   setPassword('');setRepeat('')
   if(creating&&!result.data.session){setMessage('Cadastro enviado. Abra o e-mail de confirmação e depois volte ao ícone do FinanceApp para entrar com a senha criada.');setCreating(false)}
   else setSession(result.data.session)
  }catch(e){setError(errorText(e))}finally{setBusy(false)}
 }
 async function confirm(){
  setBusy(true);setError('')
  try{setReview(await confirmCloudReview(review,deviceId));setMessage('Conferência deste iPhone registrada. As edições continuam pausadas até a liberação da nova sincronização.')}catch(e){setError(errorText(e))}finally{setBusy(false)}
 }
 if(!configured)return null
 const button='min-h-[48px] w-full rounded-xl border border-[#3AF2A1]/40 px-4 py-3 font-bold text-[#3AF2A1] disabled:opacity-40'
 const field='min-h-[48px] w-full rounded-xl border border-[#1C3D2E] bg-[#07140D] px-3 text-white'
 const launches=review?.tables.lancamentos.filter(r=>!r.deletedAt&&(!month||String(r.dataCompetencia).startsWith(month))&&(!search||r.descricao?.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))).sort((a,b)=>String(b.dataCompetencia).localeCompare(String(a.dataCompetencia)))||[]
 return <section className="space-y-4 rounded-2xl border border-[#3AF2A1]/40 p-4">
  <h2 className="text-xl font-bold">Conferir a base consolidada</h2>
  <p className="text-sm leading-6 text-[#C7D2CC]">Os backups dos dois iPhones estão preservados. Entre para conferir a nova base. Os dados antigos continuam separados neste aparelho; esta etapa não libera edições.</p>
  {!session?<form onSubmit={authenticate} className="space-y-3">
   <label className="block text-sm">E-mail autorizado<input className={field} type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
   <label className="block text-sm">{creating?'Crie uma senha':'Senha'}<input className={field} type="password" autoComplete={creating?'new-password':'current-password'} required minLength={8} value={password} onChange={e=>setPassword(e.target.value)}/></label>
   {creating&&<label className="block text-sm">Repita a senha<input className={field} type="password" autoComplete="new-password" required minLength={8} value={repeat} onChange={e=>setRepeat(e.target.value)}/></label>}
   <button className={button} disabled={busy}>{busy?'Aguarde…':creating?'Criar acesso e confirmar e-mail':'Entrar na nova base'}</button>
   <button className="min-h-[44px] w-full text-sm underline" type="button" disabled={busy} onClick={()=>{setCreating(!creating);setError('');setPassword('');setRepeat('')}}>{creating?'Já criei meu acesso':'Primeiro acesso: criar senha'}</button>
  </form>:<>
   <p className="break-all text-sm text-[#91A99C]">Conectado como {session.user.email}</p>
   {review&&<>
    <div className="grid grid-cols-2 gap-2 text-sm">{[['Lançamentos',review.tables.lancamentos.length],['Categorias',review.tables.categorias.length],['Subcategorias',review.tables.subcategorias.length],['Cartões',review.tables.cartoes.length]].map(([title,count])=><div key={title} className="rounded-xl bg-[#07140D] p-3"><strong className="block text-xl">{count}</strong>{title}</div>)}</div>
    <p className="text-xs leading-5 text-[#91A99C]">As quantidades incluem o histórico preservado. A lista abaixo mostra os lançamentos ativos do mês escolhido.</p>
    <label className="block text-sm">Mês para conferir<input aria-label="Mês para conferir" className={field} type="month" value={month} onChange={e=>{setMonth(e.target.value);setLimit(40)}}/></label>
    <input aria-label="Buscar lançamento" placeholder="Buscar lançamento" className={field} value={search} onChange={e=>{setSearch(e.target.value);setLimit(40)}}/>
    <p className="text-sm">{launches.length} lançamento(s) nesta seleção</p>
    <ul className="max-h-96 space-y-2 overflow-y-auto">{launches.slice(0,limit).map(r=><li key={r.uuid} className="rounded-xl bg-[#07140D] p-3 text-sm"><strong>{r.descricao}</strong><span className="float-right">{Number(r.valor||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</span><p className="mt-1 text-xs text-[#91A99C]">{r.dataCompetencia} · {review.tables.categorias.find(c=>c.uuid===r.categoriaUuid)?.nome||'Sem categoria'} · {r.status==='pago'?'Pago':'Pendente'}</p></li>)}</ul>
    {launches.length>limit&&<button className={button} onClick={()=>setLimit(limit+40)}>Mostrar mais lançamentos</button>}
    <p className="text-sm">Conferência dos aparelhos: {review.status.confirmedDevices} de {review.status.expectedDevices}</p>
    {!review.status.knownDevice&&<p className="text-sm text-amber-300">Para registrar a conferência, abra pelo mesmo ícone do iPhone usado nos backups. O navegador do computador ou uma instalação diferente não substitui a conferência do aparelho original.</p>}
    <button className={button} disabled={busy||!review.status.knownDevice||review.status.deviceConfirmed} onClick={confirm}>{review.status.deviceConfirmed?'Este iPhone já foi conferido':'Conferi os dados neste iPhone'}</button>
   </>}
   <button className={button} disabled={busy} onClick={refresh}>{busy?'Conferindo dados…':'Atualizar conferência'}</button>
   <button className="min-h-[44px] w-full text-sm underline" disabled={busy} onClick={async()=>{await getCloudClient().auth.signOut();setSession(null);setReview(null)}}>Sair desta conta</button>
  </>}
  {message&&<p role="status" className="text-sm leading-6 text-[#3AF2A1]">{message}</p>}
  {error&&<p role="alert" className="text-sm leading-6 text-amber-300">{error}</p>}
 </section>
}
