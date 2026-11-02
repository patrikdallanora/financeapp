import {useState} from 'react'
import {useLiveQuery} from 'dexie-react-hooks'
import {cloudDatabase} from '../db/cloudDatabase.js'
import {loadConflictReview,chooseConflictReview} from '../sync/cloudSyncManager.js'
import {applyIntent} from '../sync/resolveCloudConflict.js'

const labels={valor:'Valor',status:'Situação',dataPagamento:'Pagamento',dataCompetencia:'Competência',deletedAt:'Exclusão',faturaValorPago:'Valor pago da fatura',faturaFechada:'Fatura quitada',categoriaUuid:'Categoria',subcategoriaUuid:'Subcategoria',cartaoUuid:'Cartão',usuarioUuid:'Pessoa',descricao:'Descrição',nome:'Nome'}
const relationTables={categoriaUuid:'categorias',subcategoriaUuid:'subcategorias',cartaoUuid:'cartoes',usuarioUuid:'usuarios'}
export function ConflictBanner(){
 const [review,setReview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const conflicts=useLiveQuery(()=>cloudDatabase.raw.outbox.where('status').equals('conflict').toArray(),[])||[]
 const catalogs=useLiveQuery(async()=>Object.fromEntries(await Promise.all(Object.values(relationTables).map(async t=>[t,await cloudDatabase.raw.table(t).toArray()]))),[])||{}
 if(!conflicts.length)return null
 async function open(sequence){setBusy(true);setError('');try{setReview(await loadConflictReview(sequence))}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function choose(choice){setBusy(true);setError('');try{await chooseConflictReview(review,choice);setReview(null)}catch(e){setError(e.message)}finally{setBusy(false)}}
 const format=(field,value)=>value==null?'Vazio':relationTables[field]?catalogs[relationTables[field]]?.find(r=>r.uuid===value)?.nome||'Cadastro indisponível':['valor','limite','valorAlvo','faturaValorPago'].includes(field)?(Number(value)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):typeof value==='boolean'?(value?'Sim':'Não'):typeof value==='object'?JSON.stringify(value):String(value)
 const button='min-h-[44px] rounded-xl border border-amber-500/40 p-3 font-bold disabled:opacity-40'
 return <aside className="space-y-3 border-b border-amber-800 bg-[#251b07] p-4 text-sm text-amber-100">
  <p className="font-bold">{conflicts.length} ação(ões) precisa(m) de revisão</p><p>Os aparelhos alteraram os mesmos registros. As versões foram preservadas; escolha como continuar.</p>
  {conflicts.map(op=><button key={op.sequence} className={button+' w-full text-left'} disabled={busy} onClick={()=>open(op.sequence)}>Revisar {op.changes[0].payload.descricao||op.changes[0].payload.nome||'alteração'} · {op.changes.length} registro(s)</button>)}
  {review&&<section className="space-y-3 rounded-xl border border-amber-800 p-3">
   <h2 className="font-bold">Conferir antes de escolher</h2>
   <p>As opções abaixo valem para toda esta ação. Edições feitas depois dela continuam na fila.</p>
   <div className="max-h-96 space-y-3 overflow-y-auto">{review.op.changes.map(c=>{
    const remote=review.snapshots.find(r=>r.table_name===c.table&&r.uuid===c.uuid),proposed=applyIntent(c.basePayload,c.payload,remote?.payload||{})
    const fields=[...new Set([...Object.keys(proposed),...Object.keys(remote?.payload||{})])].filter(f=>f!=='uuid'&&JSON.stringify(proposed[f])!==JSON.stringify(remote?.payload?.[f]))
    return <div key={c.table+':'+c.uuid} className="space-y-1 border-b border-amber-900 pb-3"><strong>{c.payload.descricao||c.payload.nome||'Registro'}</strong>{!remote&&<p>Este registro ainda não existe no servidor.</p>}{fields.map(f=><div key={f}><p className="font-semibold">{labels[f]||f}</p><p>Servidor: {format(f,remote?.payload?.[f])}</p><p>Minha alteração: {format(f,proposed[f])}</p></div>)}</div>
   })}</div>
   <button className={button+' w-full'} disabled={busy} onClick={()=>choose('local')}>Aplicar minha alteração sobre a versão conferida</button>
   <button className={button+' w-full'} disabled={busy} onClick={()=>choose('server')}>Usar a versão do servidor para esta ação</button>
   <button className={button+' w-full'} disabled={busy} onClick={()=>setReview(null)}>Decidir depois</button>
  </section>}
  {error&&<p role="alert">{error}</p>}
 </aside>
}
