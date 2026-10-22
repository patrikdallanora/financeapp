import { useEffect, useRef, useState } from 'react'
import { Bot, Send, Plus, Loader2 } from 'lucide-react'
import { db } from '../db/database'
import { TopoTela } from '../components/TopoTela'
import { prepararDados } from '../../lib/assistenteFinanceiro.js'
import { responderConsulta } from '../../lib/interpretarConsulta.js'
import './assistente.css'

const moeda = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const nomes = { parcelados: 'Compras parceladas', fixos: 'Gastos fixos', avulsos: 'Gastos avulsos' }

export default function Assistente() {
  const [mensagens, setMensagens] = useState([])
  const [pergunta, setPergunta] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const contexto = useRef(null)
  const controle = useRef(null)
  const trava = useRef(false)
  const fim = useRef(null)
  useEffect(() => () => controle.current?.abort(), [])
  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [mensagens, ocupado, erro])

  async function enviar(event) {
    event.preventDefault()
    const texto = pergunta.trim()
    if (!texto || trava.current) return
    trava.current = true
    setOcupado(true)
    setErro('')
    const controller = new AbortController()
    controle.current = controller
    try {
      const snapshot = await db.transaction('r', db.lancamentos, db.categorias, async () => prepararDados(await db.lancamentos.toArray(), await db.categorias.toArray()))
      const data = responderConsulta(texto, snapshot, contexto.current)
      if (controller.signal.aborted) return
      if (!data.esclarecimento && (!data.resultado || !data.plano)) throw new Error('A resposta do serviço está incompleta. Tente novamente.')
      if (data.plano) contexto.current = data.plano
      setMensagens(lista => [...lista, { pergunta: texto, ...data }])
      setPergunta('')
    } catch (e) {
      if (controle.current === controller) setErro(e.name === 'AbortError' ? 'A consulta foi interrompida ou demorou demais. Sua pergunta foi mantida para tentar novamente.' : e.message)
    } finally {
      if (controle.current === controller) { setOcupado(false); trava.current = false }
    }
  }

  function novaConversa() {
    controle.current?.abort()
    controle.current = null
    trava.current = false
    contexto.current = null
    setMensagens([]); setPergunta(''); setErro(''); setOcupado(false)
  }

  return <div className="assistente">
    <TopoTela titulo="Assistente" subtitulo="Pergunte sobre seus gastos. Continue a conversa para explorar os detalhes."
      acao={<button type="button" onClick={novaConversa} className="ia-nova" aria-label="Nova conversa"><Plus size={20} /></button>} />
    <div className="ia-intro"><Bot size={22} /><div><strong>Seu dinheiro, explicado.</strong><p>Consulte totais, categorias e parcelas. As respostas usam os lançamentos deste aparelho e não alteram seus dados.</p></div></div>
    <div className="ia-conversa" role="log" aria-label="Conversa com o assistente" aria-live="polite" aria-relevant="additions">
      {mensagens.map((m, i) => <section key={i} className="ia-troca">
        <div className="ia-pergunta"><span>Você</span><p>{m.pergunta}</p></div>
        <div className="ia-resposta"><p className="ia-assinatura"><Bot size={16} /> Assistente</p>
          {m.esclarecimento ? <p>{m.esclarecimento}</p> : <Resposta consulta={m} />}
        </div>
      </section>)}
    </div>
    {ocupado && <p className="ia-status" role="status"><Loader2 size={16} className="animate-spin" /> Consultando seus lançamentos…</p>}
    {erro && <p className="ia-erro" role="alert">{erro}</p>}
    <div ref={fim} />
    <form onSubmit={enviar} className="ia-form">
      <label htmlFor="ia-pergunta">Sua pergunta</label>
      <textarea id="ia-pergunta" rows={3} maxLength={2000} value={pergunta} onChange={e => setPergunta(e.target.value)} placeholder="Digite sua pergunta" disabled={ocupado} />
      <div><span>A conversa fica nesta tela até você sair.</span><button type="submit" disabled={ocupado || !pergunta.trim()}><Send size={16} /> Perguntar</button></div>
    </form>
    <p className="ia-privacidade">Consulta local, sem IA e sem consumo de tokens. Funciona sem internet com os dados já salvos. Confira os filtros em cada resposta.</p>
  </div>
}

function Resposta({ consulta }) {
  const { resultado: r, plano: p, consultadoEm } = consulta
  const filtros = [p.meses.join(', '), p.tipo === 'despesa' ? 'Despesas' : 'Receitas',
    p.grupo !== 'todos' && nomes[p.grupo], p.categorias.length > 0 && `Categorias: ${p.categorias.join(', ')}`,
    p.excluirCategorias.length > 0 && `Sem: ${p.excluirCategorias.join(', ')}`,
    p.descricoes.length > 0 && `Lançamentos: ${p.descricoes.join(', ')}`,
    p.excluirDescricoes.length > 0 && `Excluídos: ${p.excluirDescricoes.join(', ')}`, p.beneficiario && `Pessoa: ${p.beneficiario}`].filter(Boolean)
  return <>
    <p className="ia-filtros">{filtros.join(' · ')}</p>
    <p className="ia-total">{moeda(r.totalCentavos)}</p><p className="ia-contagem">{r.quantidade} lançamento(s)</p>
    {p.meses.length > 1 && <ul className="ia-meses">{r.totaisMes.map(m => <li key={m.mes}>{m.mes}: <strong>{moeda(m.centavos)}</strong></li>)}</ul>}
    {!r.quantidade ? <p>Nenhum lançamento encontrado com esses filtros.</p> : <div className="ia-tabela"><table>
      <thead><tr><th>{p.agrupamento === 'categorias' ? 'Categoria' : 'Descrição'}</th>{p.meses.length > 1 && <th>Mês</th>}<th>Valor</th>{p.agrupamento === 'parcelas' && <><th>Parcela</th><th>Faltam</th></>}</tr></thead>
      <tbody>{r.linhas.map((l, i) => <tr key={i}><td>{nomes[l.nome] || l.nome}{l.quantidade > 1 && <small>{l.quantidade} lançamentos</small>}</td>{p.meses.length > 1 && <td>{l.mes}</td>}<td>{moeda(l.centavos)}</td>{p.agrupamento === 'parcelas' && <><td>{l.parcelasNoMes.join(', ')}/{l.totalParcelas ?? '—'}</td><td>{l.restantes ?? '—'}</td></>}</tr>)}</tbody>
    </table></div>}
    <details className="ia-criterios"><summary>Critérios e base da resposta</summary><p>{r.aviso}</p><p>Consulta em {new Date(consultadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (São Paulo). Mês em andamento pode mudar.</p></details>
  </>
}

