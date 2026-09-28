import { useState } from 'react'
import { variacaoMensal } from '../utils/comparacaoMensal.js'
import { IconeCategoria } from './IconeCategoria'
import './dashboardComparativo.css'

const moeda = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const percentual = (n) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
const mesCurto = (ref) => new Date(`${ref}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') + '/' + ref.slice(2, 4)

export function CardResumo({ titulo, valor, tipo, onClick, anterior, temAnterior, referenciaAnterior }) {
  const Tag = onClick ? 'button' : 'div'
  return <Tag onClick={onClick} className="home-resumo" aria-label={onClick ? `Abrir extrato de ${titulo.toLowerCase()}` : undefined}>
    <span>{titulo}</span><strong className={tipo === 'positivo' ? 'home-positivo' : 'home-negativo'}>{moeda(valor)}</strong>
    <small>{variacaoMensal(valor, anterior, temAnterior)}{temAnterior && anterior !== 0 ? ` vs. ${mesCurto(referenciaAnterior)}` : ''}</small>
  </Tag>
}

export function ComparacaoMensal({ atual, anterior, referencia, referenciaAnterior }) {
  const [indicador, setIndicador] = useState('despesa')
  const valor = atual[indicador], previo = anterior[indicador]
  const limite = Math.max(Math.abs(valor), Math.abs(previo), 1)
  const diferenca = valor - previo
  const data = new Date()
  const mesHoje = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`
  const temNegativo = valor < 0 || previo < 0
  return <section className="home-painel" aria-label="Comparação mensal">
    <p className="home-sobretitulo">Sua evolução</p><h2>Um mês ao lado do outro</h2>
    <div className="home-abas" aria-label="Indicador comparado">{[['despesa','Despesas'],['receita','Receitas'],['saldo','Saldo']].map(([key, nome]) =>
      <button key={key} onClick={() => setIndicador(key)} aria-pressed={indicador === key}>{nome}</button>)}</div>
    <div aria-live="polite"><div className="home-destaque"><strong>{moeda(valor)}</strong><span>{anterior.temDados ? `${moeda(Math.abs(diferenca))} ${diferenca < 0 ? 'a menos' : diferenca > 0 ? 'a mais' : 'de diferença'}` : 'Sem registros no mês anterior'}</span></div>
      {[[referenciaAnterior, previo, true], [referencia, valor, false]].map(([ref, n, passado]) => <div className="home-comparacao-linha" key={ref}>
        <span>{mesCurto(ref)}</span><div className={`home-trilho ${temNegativo ? 'home-divergente' : ''}`} role="img" aria-label={`${mesCurto(ref)}: ${moeda(n)}`}>
          <div className={`home-barra ${passado ? 'home-anterior' : ''}`} style={{ width: `${Math.abs(n) / limite * (temNegativo ? 50 : 100)}%`, ...(temNegativo ? { left: n < 0 ? `${50 - Math.abs(n) / limite * 50}%` : '50%', position: 'absolute' } : {}) }} />
        </div><b>{moeda(n)}</b></div>)}
    </div>
    {temNegativo && <p className="home-legenda">← Negativo · zero ao centro · positivo →</p>}
    <p className="home-nota">{referencia === mesHoje ? 'Mês em andamento · valores registrados até agora.' : referencia > mesHoje ? 'Mês futuro · lançamentos previstos.' : 'Totais registrados nos meses de referência.'}<br />Cartão por fatura; demais lançamentos por competência.</p>
  </section>
}

export function CardAnaliseCategorias({ modo, setModo, categorias, total, onSelecionarCategoria, referencia, referenciaAnterior, temAnterior }) {
  const limite = Math.max(...categorias.flatMap((c) => [Math.abs(c.total), Math.abs(c.anterior)]), 1)
  return <section className="home-painel"><div className="home-cabecalho"><div><p className="home-sobretitulo">Análise</p><h2>Gastos por categoria</h2></div>
    <div className="home-modos">{[['grafico','Gráfico'],['lista','Lista']].map(([key,nome]) => <button key={key} aria-pressed={modo === key} onClick={() => setModo(key)}>{nome}</button>)}</div></div>
    <p className="home-nota">Total analisado: <b>{moeda(total)}</b></p>
    <div className="home-legenda"><span><i />{mesCurto(referencia)}</span><span><i className="home-anterior" />{mesCurto(referenciaAnterior)}</span></div>
    {categorias.length === 0 ? <p className="home-nota">Nenhuma despesa encontrada nos dois meses.</p> : categorias.map((c) => <button className="home-categoria" key={c.uuid || c.id} onClick={() => onSelecionarCategoria(c)}>
      <div className="home-categoria-topo"><div className="home-categoria-nome"><IconeCategoria icone={c.icone} cor={c.cor} tamanho="sm" ativo /><b>{c.nome}</b></div><span><b>{moeda(c.total)}</b><small>{percentual(c.percentual)} do mês</small></span></div>
      {modo === 'grafico' && <div className="home-barras-categoria" role="img" aria-label={`${c.nome}: ${moeda(c.total)} em ${mesCurto(referencia)}; ${moeda(c.anterior)} em ${mesCurto(referenciaAnterior)}`}><div className="home-trilho"><div className="home-barra" style={{ width: `${Math.abs(c.total) / limite * 100}%` }} /></div><div className="home-trilho"><div className="home-barra home-anterior" style={{ width: `${Math.abs(c.anterior) / limite * 100}%` }} /></div></div>}
      <div className="home-categoria-rodape"><span>{mesCurto(referenciaAnterior)}: {moeda(c.anterior)}</span><span>{variacaoMensal(c.total, c.anterior, temAnterior)}</span></div>
    </button>)}
  </section>
}

