import {useEffect,useState} from 'react'
import {useLiveQuery} from 'dexie-react-hooks'
import {TopoTela} from '../components/TopoTela'
import {CardPremium} from '../components/CardPremium'
import {obterStatusSync,executarSync,contarPendenciasSync,signOutCloud} from '../sync/cloudSyncManager.js'
import {notificationStatus,enableCloudNotifications,testCloudNotification} from '../services/cloudNotifications.js'
import {cloudBackup} from '../backup/cloudBackup.js'
import {prepareBackupFile,saveBackupFile} from '../backup/browserBackup.js'
export default function Configuracoes(){
 const [status,setStatus]=useState(obterStatusSync()),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[file,setFile]=useState(null),[push,setPush]=useState(notificationStatus())
 const pending=useLiveQuery(contarPendenciasSync,[])||{pendentes:0,conflitos:0}
 useEffect(()=>{const update=()=>setStatus(obterStatusSync());window.addEventListener('financeapp-sync-status',update);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('financeapp-sync-status',update);window.removeEventListener('online',update);window.removeEventListener('offline',update)}},[])
 async function action(fn,success){setBusy(true);setError('');setMessage('');try{await fn();if(success)setMessage(success)}catch(e){setError(e.message)}finally{setBusy(false)}}
 const button='min-h-[48px] w-full rounded-2xl border border-[#3AF2A1]/40 p-3 text-sm font-bold text-[#3AF2A1] disabled:opacity-40'
 return <div className="space-y-4 pb-24"><TopoTela titulo="Configurações" subtitulo="Sincronização, notificações e cópias de segurança."/>
  <CardPremium className="space-y-3"><h2 className="font-bold">Sincronização automática</h2><p className="text-sm leading-6 text-[#91A99C]">As alterações ficam salvas neste aparelho até o servidor confirmar cada operação. Você pode continuar usando o app sem internet.</p>
   <p className="text-sm">Conexão: {status.online?'online':'offline'}</p><p className="text-sm">Estado: {status.sincronizando?'sincronizando…':pending.conflitos?'aguardando revisão':pending.pendentes?'aguardando confirmação':'sem pendências'}</p>
   <p className="text-sm">Aguardando envio: {pending.pendentes} · Conflitos: {pending.conflitos}</p>
   <p className="text-xs text-[#91A99C]">Última sincronização: {status.ultimaSincronizacao?new Date(status.ultimaSincronizacao).toLocaleString('pt-BR'):'ainda não confirmada'}</p>
   {status.ultimoErro&&<p role="status" className="text-sm text-amber-300">{status.ultimoErro}</p>}
   <button className={button} disabled={busy||status.sincronizando} onClick={()=>action(async()=>{const result=await executarSync();if(!result.sucesso)throw Error(result.erro)})}>Sincronizar agora</button>
  </CardPremium>
  <CardPremium className="space-y-3"><h2 className="font-bold">Notificações</h2><p className="text-sm text-[#91A99C]">{push.ativo?'Registradas para este aparelho.':'Ative ou atualize o registro para receber alertas nesta instalação.'}</p>
   <button className={button} disabled={busy||!push.suportado} onClick={()=>action(async()=>{await enableCloudNotifications();setPush(notificationStatus())},'Notificações registradas.')}>{push.ativo?'Atualizar notificações':'Ativar notificações'}</button>
   <button className={button} disabled={busy||!push.ativo} onClick={()=>action(testCloudNotification,'Teste exibido neste aparelho.')}>Testar neste aparelho</button>
  </CardPremium>
  <CardPremium className="space-y-3"><h2 className="font-bold">Cópia de segurança</h2><p className="text-sm leading-6 text-[#91A99C]">Inclui os dados e as operações que ainda aguardam envio. O arquivo não contém sua senha ou sessão. Guarde-o em local privado.</p>
   <button className={button} disabled={busy} onClick={()=>action(async()=>{const backup=await cloudBackup.capture({label:'base-consolidada'});setFile(prepareBackupFile(backup,'base-consolidada'))},'Cópia preparada. Agora salve o arquivo.')}>Preparar cópia atual</button>
   {file&&<button className={button} disabled={busy} onClick={()=>action(()=>saveBackupFile(file,{share:true}),'Salvamento solicitado. Confira o arquivo no app Arquivos.')}>Salvar cópia em Arquivos</button>}
   <p className="text-xs leading-5 text-[#91A99C]">A base antiga e a cópia inicial da base consolidada continuam preservadas neste aparelho. Não há restauração que apague dados ou pendências automaticamente.</p>
  </CardPremium>
  <button className={button} disabled={busy||pending.pendentes>0||pending.conflitos>0} onClick={()=>action(signOutCloud)}>Sair da conta</button>
  {(pending.pendentes>0||pending.conflitos>0)&&<p className="text-xs text-[#91A99C]">Confirme os envios e revise os conflitos antes de sair.</p>}
  {message&&<p role="status" className="text-sm text-[#3AF2A1]">{message}</p>}{error&&<p role="alert" className="text-sm text-amber-300">{error}</p>}
 </div>
}
