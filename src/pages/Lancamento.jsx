import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Save, Sparkles, Plus, Tags, Wallet, FileText } from 'lucide-react'

import { db, criarRegistroBase, agora, gerarUUID } from '../db/database'
import { agendarSync } from '../sync/syncManager'
import { Botao } from '../components/Botao'
import { CampoTexto } from '../components/CampoTexto'
import './lancamento.css'
import { CadastroRapido } from '../components/CadastroRapido'
import { distribuirParcelas, somarMeses } from '../utils/parcelamento'
import { FiltroSegmentado } from '../components/FiltroSegmentado'
import { TopoTela } from '../components/TopoTela'
import { IconeCategoria } from '../components/IconeCategoria'

const formatarCampoMoeda = (valor) => {
  const apenasNumeros = String(valor || '').replace(/\D/g, '')
  const numero = Number(apenasNumeros) / 100

  return numero.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
}

const moedaParaNumero = (valorFormatado) => {
  const apenasNumeros = String(valorFormatado || '').replace(/\D/g, '')
  return Number(apenasNumeros) / 100
}

const adicionarMeses = somarMeses
const adicionarMesesFatura = (mes, quantidade) => somarMeses(`${mes}-01`, quantidade).slice(0, 7)

const calcularFaturaAtualCartao = (dataCompetencia, cartao) => {
  if (!dataCompetencia) return ''
  if (!cartao) return dataCompetencia.slice(0, 7)

  const [ano, mes, dia] = dataCompetencia.split('-').map(Number)
  const dataBase = new Date(ano, mes - 1, 1)

  if (dia > Number(cartao.diaFechamento || 31)) {
    dataBase.setMonth(dataBase.getMonth() + 1)
  }

  return dataBase.toISOString().slice(0, 7)
}

const gerarOpcoesFatura = (faturaBase) => {
  return Array.from({ length: 25 }, (_, index) => {
    const deslocamento = index - 12
    return adicionarMesesFatura(faturaBase, deslocamento)
  })
}

const formatarFatura = (faturaRef) => {
  if (!faturaRef) return ''

  const [ano, mes] = faturaRef.split('-').map(Number)
  const data = new Date(ano, mes - 1, 1)

  const mesNome = data.toLocaleDateString('pt-BR', {
    month: 'long'
  })

  const mesFormatado = mesNome.charAt(0).toUpperCase() + mesNome.slice(1)
  const anoCurto = String(ano).slice(-2)

  return `${mesFormatado}/${anoCurto}`
}

const faturaEhAnterior = (faturaRef) => {
  if (!faturaRef) return false

  const mesAtual = new Date().toISOString().slice(0, 7)
  return faturaRef < mesAtual
}

const normalizarTexto = (texto) => {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export default function Lancamento({ onVoltar, configInicial }) {
  const [tipo] = useState(configInicial?.tipo || 'despesa')
  const [usuarioId, setUsuarioId] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [dataCompetencia, setDataCompetencia] = useState(agora())
  const [metodoPagamento, setMetodoPagamento] = useState(
    configInicial?.metodoPagamento || 'pix'
  )
  const [status, setStatus] = useState('pendente')
  const [categoriaId, setCategoriaId] = useState('')
  const [subcategoriaId, setSubcategoriaId] = useState('')
  const [cartaoId, setCartaoId] = useState('')
  const [faturaRef, setFaturaRef] = useState('')
  const [tipoLancamento, setTipoLancamento] = useState('simples')
  const [parcelaAtual, setParcelaAtual] = useState('1')
  const [totalParcelas, setTotalParcelas] = useState('2')
  const [observacoes, setObservacoes] = useState('')
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false)

  const [cadastroAberto, setCadastroAberto] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [erroSalvar, setErroSalvar] = useState('')
  const travaSalvar = useRef(false)
  const [modoValorParcelado, setModoValorParcelado] = useState('total')

  const usuarios = useLiveQuery(async () => {
    return await db.usuarios.toArray()
  }, [])

  const categorias = useLiveQuery(async () => {
    const todas = await db.categorias.toArray()
    return todas.filter((categoria) => !categoria.deletedAt)
  }, [])

  const subcategorias = useLiveQuery(async () => {
    const todas = await db.subcategorias.toArray()
    return todas.filter((subcategoria) => !subcategoria.deletedAt)
  }, [])

  const cartoes = useLiveQuery(async () => {
    const todos = await db.cartoes.toArray()
    return todos.filter((cartao) => !cartao.deletedAt && cartao.ativo)
  }, [])

  const lancamentos = useLiveQuery(async () => {
    const todos = await db.lancamentos.toArray()
    return todos.filter((lancamento) => !lancamento.deletedAt)
  }, [])

  const usuarioPadrao = usuarios?.find((usuario) => usuario.nome === 'PK') || usuarios?.[0]

  const categoriasFiltradas = useMemo(() => {
    if (!categorias) return []

    return categorias.filter(
      (categoria) => categoria.tipo === tipo || categoria.tipo === 'ambos'
    )
  }, [categorias, tipo])

  const subcategoriasFiltradas = useMemo(() => {
  if (!subcategorias || !categorias || !categoriaId) return []

  const categoriaSelecionada = categorias.find(
    (categoria) => Number(categoria.id) === Number(categoriaId)
  )

  if (!categoriaSelecionada) return []

  return subcategorias.filter(
    (subcategoria) =>
      subcategoria.categoriaUuid === categoriaSelecionada.uuid ||
      Number(subcategoria.categoriaId) === Number(categoriaSelecionada.id)
  )
}, [subcategorias, categorias, categoriaId])

  const cartaoSelecionado = useMemo(() => {
    if (!cartoes || !cartaoId) return null
    return cartoes.find((cartao) => cartao.id === Number(cartaoId))
  }, [cartoes, cartaoId])

  const categoriaSelecionada = useMemo(() => {
    if (!categorias || !categoriaId) return null
    return categorias.find((categoria) => categoria.id === Number(categoriaId))
  }, [categorias, categoriaId])

  const faturaCalculada = useMemo(() => {
    return calcularFaturaAtualCartao(dataCompetencia, cartaoSelecionado)
  }, [dataCompetencia, cartaoSelecionado])

  const faturaSelecionada = faturaRef || faturaCalculada

  const opcoesFatura = useMemo(() => {
    return gerarOpcoesFatura(faturaCalculada)
  }, [faturaCalculada])

  const usuarioSelecionado = usuarioId || usuarioPadrao?.id || ''
  const lancamentoCartao = metodoPagamento === 'cartao'
  const mostrarStatus = !lancamentoCartao || faturaEhAnterior(faturaSelecionada)

const valorNumerico = moedaParaNumero(valor)
const totalParcelasNumero = Math.max(Number(totalParcelas || 0), 0)

const parcelasPreview = useMemo(() => distribuirParcelas(valorNumerico, totalParcelasNumero, modoValorParcelado), [valorNumerico, totalParcelasNumero, modoValorParcelado])
const parcelaInicialNumero = Number(parcelaAtual)
const parcelasValidas = parcelasPreview.length > 0 && Number.isInteger(parcelaInicialNumero) && parcelaInicialNumero >= 1 && parcelaInicialNumero <= totalParcelasNumero
const moeda = (numero) => numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const sugestoesBase = useMemo(() => {
    if (!lancamentos || !categorias || !subcategorias) return []

    const mapa = new Map()

    const historicoOrdenado = [...lancamentos]
      .filter((lancamento) => lancamento.descricao)
      .sort((a, b) => {
        const dataA = new Date(a.updatedAt || a.dataCompetencia || 0).getTime()
        const dataB = new Date(b.updatedAt || b.dataCompetencia || 0).getTime()
        return dataB - dataA
      })

    for (const lancamento of historicoOrdenado) {
      const chave = normalizarTexto(lancamento.descricao)

      if (!chave || mapa.has(chave)) continue

      const categoria = categorias.find(
  (item) =>
    item.uuid === lancamento.categoriaUuid ||
    item.id === Number(lancamento.categoriaId)
)

const subcategoria = subcategorias.find(
  (item) =>
    item.uuid === lancamento.subcategoriaUuid ||
    item.id === Number(lancamento.subcategoriaId)
)

const cartao = cartoes?.find(
  (item) =>
    item.uuid === lancamento.cartaoUuid ||
    item.id === Number(lancamento.cartaoId)
)

      mapa.set(chave, {
        descricao: lancamento.descricao,
        tipo: lancamento.tipo,
        metodoPagamento: lancamento.metodoPagamento,
        categoriaId: lancamento.categoriaId,
        categoriaUuid: lancamento.categoriaUuid,
        subcategoriaId: lancamento.subcategoriaId,
        subcategoriaUuid: lancamento.subcategoriaUuid,
        cartaoId: lancamento.cartaoId,
        cartaoUuid: lancamento.cartaoUuid,
        categoria,
        subcategoria,
        cartao
      })
    }

    return Array.from(mapa.values())
  }, [lancamentos, categorias, subcategorias, cartoes])

  const sugestoesFiltradas = useMemo(() => {
    const termo = normalizarTexto(descricao)

    if (termo.length < 2 || !mostrarSugestoes) return []

    return sugestoesBase
      .filter((sugestao) => {
        const descricaoNormalizada = normalizarTexto(sugestao.descricao)
        return descricaoNormalizada.includes(termo)
      })
      .filter((sugestao) => {
        if (tipo === 'receita') return sugestao.tipo === 'receita'
        return sugestao.tipo === 'despesa'
      })
      .slice(0, 6)
  }, [descricao, sugestoesBase, mostrarSugestoes, tipo])

  const atualizarMetodo = (metodo) => {
    setMetodoPagamento(metodo)
    if (metodo === 'cartao' && !dataCompetencia) setDataCompetencia(agora())

    if (metodo !== 'cartao') {
      setCartaoId('')
      setFaturaRef('')
    }
  }

  const atualizarCartao = (id) => {
    setCartaoId(id)

    const cartao = cartoes?.find((item) => item.id === Number(id))
    const fatura = calcularFaturaAtualCartao(dataCompetencia, cartao)

    setFaturaRef(fatura)
  }

  const atualizarDataCompetencia = (data) => {
    setDataCompetencia(data)

    if (metodoPagamento === 'cartao') {
      const fatura = calcularFaturaAtualCartao(data, cartaoSelecionado)
      setFaturaRef(fatura)
    }
  }

  const selecionarSugestao = (sugestao) => {
    setDescricao(sugestao.descricao || '')

    if (sugestao.metodoPagamento && configInicial?.metodoPagamento !== 'cartao') {
      setMetodoPagamento(sugestao.metodoPagamento)
    }

    if (sugestao.categoriaId) {
      setCategoriaId(String(sugestao.categoriaId))
    }

    if (sugestao.subcategoriaId) {
      setSubcategoriaId(String(sugestao.subcategoriaId))
    }

    if (sugestao.metodoPagamento === 'cartao' && sugestao.cartaoId) {
      atualizarCartao(String(sugestao.cartaoId))
    }

    setMostrarSugestoes(false)
  }

  const validar = () => {
    if (!usuarioSelecionado) return 'Selecione o usuário.'
    if (!descricao.trim()) return 'Informe a descrição.'
    if (!moedaParaNumero(valor)) return 'Informe um valor válido.'
    if (!dataCompetencia) return 'Informe a data de competência.'
    if (!categoriaSelecionada) return 'Selecione uma categoria.'
    if (subcategoriaId && !subcategoriasFiltradas.some(item => item.id === Number(subcategoriaId))) return 'Selecione uma subcategoria desta categoria.'

    if (metodoPagamento === 'cartao') {
      if (!cartaoSelecionado) return 'Selecione o cartão.'
      if (!faturaSelecionada) return 'Selecione a fatura de referência.'
    }

    if (tipoLancamento === 'parcelado') {
      if (!Number.isInteger(Number(parcelaAtual)) || Number(parcelaAtual) < 1) return 'Informe a parcela atual.'
      if (!Number.isInteger(Number(totalParcelas)) || Number(totalParcelas) < 2 || Number(totalParcelas) > 999) return 'Informe o total de parcelas.'

      if (!parcelasPreview.length) return 'O valor deve permitir ao menos um centavo por parcela.'
      if (Number(parcelaAtual) > Number(totalParcelas)) {
        return 'A parcela atual não pode ser maior que o total.'
      }
    }

    return null
  }

  const montarLancamentoBase = () => {
    const valorNumerico = moedaParaNumero(valor)
    const statusFinal = mostrarStatus ? status : 'pendente'
    const dataPagamento = statusFinal === 'pago' ? dataCompetencia : null

    const usuario = usuarios?.find(
  (item) => Number(item.id) === Number(usuarioSelecionado)
)

const cartao = cartoes?.find(
  (item) => Number(item.id) === Number(cartaoId)
)

const categoria = categorias?.find(
  (item) => Number(item.id) === Number(categoriaId)
)

const subcategoria = subcategorias?.find(
  (item) => Number(item.id) === Number(subcategoriaId)
)

    return {
      tipo,
      usuarioId: Number(usuarioSelecionado),
      usuarioUuid: usuario?.uuid || null,
      descricao: descricao.trim(),
      valor: valorNumerico,
      dataCompetencia,
      dataPagamento,
      metodoPagamento,
      cartaoId: metodoPagamento === 'cartao' ? Number(cartaoId) : null,
      cartaoUuid: metodoPagamento === 'cartao' ? cartao?.uuid || null : null,
      faturaRef: metodoPagamento === 'cartao' ? faturaSelecionada : null,
      categoriaId: Number(categoriaId),
      categoriaUuid: categoria?.uuid || null,
      subcategoriaId: subcategoriaId ? Number(subcategoriaId) : null,
      subcategoriaUuid: subcategoria?.uuid || null,
      status: statusFinal,
      recorrente: tipoLancamento === 'fixa_mensal',
      recorrenciaId: null,
      parcelaAtual: null,
      totalParcelas: null,
      parcelamentoId: null,
      observacoes: observacoes.trim()
    }
  }

  const salvarSimples = async () => {
    await db.lancamentos.add({
      ...criarRegistroBase(),
      ...montarLancamentoBase()
    })
  }

  const salvarParcelado = async () => {
  const base = montarLancamentoBase()
  const parcelamentoId = gerarUUID()
  const atual = Number(parcelaAtual)
  const total = Number(totalParcelas)

  const valoresParcelas = distribuirParcelas(moedaParaNumero(valor), total, modoValorParcelado)

  for (let parcela = 1; parcela <= total; parcela++) {
    const offset = parcela - atual
    const pagoRetroativo = parcela < atual
    const valorParcela = valoresParcelas[parcela - 1]

    await db.lancamentos.add({
      ...criarRegistroBase(),
      ...base,
      valor: valorParcela,
      status: pagoRetroativo ? 'pago' : 'pendente',
      dataPagamento: pagoRetroativo ? adicionarMeses(dataCompetencia, offset) : null,
      dataCompetencia: adicionarMeses(dataCompetencia, offset),
      faturaRef:
        metodoPagamento === 'cartao'
          ? adicionarMesesFatura(faturaSelecionada, offset)
          : null,
      parcelaAtual: parcela,
      totalParcelas: total,
      parcelamentoId,
      recorrente: false,
      recorrenciaId: null
    })
  }
}

  const salvarFixaMensal = async () => {
    const base = montarLancamentoBase()
    const recorrenciaId = gerarUUID()

    for (let mes = 0; mes < 12; mes++) {
      await db.lancamentos.add({
        ...criarRegistroBase(),
        ...base,
        dataCompetencia: adicionarMeses(dataCompetencia, mes),
        dataPagamento: base.status === 'pago' ? adicionarMeses(dataCompetencia, mes) : null,
        faturaRef:
          metodoPagamento === 'cartao'
            ? adicionarMesesFatura(faturaSelecionada, mes)
            : null,
        recorrente: true,
        recorrenciaId,
        parcelaAtual: null,
        totalParcelas: null,
        parcelamentoId: null
      })
    }


  }

  const salvar = async () => {
    if (travaSalvar.current) return
    const erro = validar()
    setErroSalvar(erro || '')
    if (erro) return
    travaSalvar.current = true
    setSalvando(true)
    try {
      await db.transaction('rw', db.lancamentos, async () => {
        if (tipoLancamento === 'simples') await salvarSimples()
        if (tipoLancamento === 'parcelado') await salvarParcelado()
        if (tipoLancamento === 'fixa_mensal') await salvarFixaMensal()
      })
      agendarSync()
      onVoltar()
    } catch (erro) {
      setErroSalvar('Não foi possível salvar. Seus dados continuam no formulário; tente novamente.')
    } finally {
      travaSalvar.current = false
      setSalvando(false)
    }
  }

  if (!usuarios || !categorias || !subcategorias || !cartoes || !lancamentos) {
    return (
      <div className="space-y-4 pb-24">
        <TopoTela titulo="Lançamento" subtitulo="Carregando formulário..." />
      </div>
    )
  }

  return (
    <div className="lancamento-novo">
      <button onClick={onVoltar} className="ln-voltar"><ArrowLeft size={17} />Voltar</button>
      <TopoTela titulo={tipo === 'receita' ? 'Nova receita' : lancamentoCartao ? 'Despesa no cartão' : 'Nova despesa'} subtitulo="Cada detalhe no lugar. Sem complicar." />
      <section className="ln-valor">
        <label><span className="ln-label">{tipoLancamento === 'parcelado' && modoValorParcelado === 'parcela' ? 'Valor da parcela' : 'Valor total'}</span>
          <input aria-label="Valor" inputMode="numeric" value={valor} placeholder="R$ 0,00" onChange={e => setValor(formatarCampoMoeda(e.target.value))} />
        </label>
        <div className="ln-responsavel"><span>Responsável</span><div className="ln-opcoes">{usuarios.filter(u => !u.deletedAt).map(u => <button key={u.id} aria-pressed={Number(usuarioSelecionado) === u.id} onClick={() => setUsuarioId(String(u.id))}>{u.nome}</button>)}</div></div>
      </section>
      <section className="ln-secao"><h2><FileText size={18} />{tipo === 'receita' ? 'Sobre a receita' : 'Sobre a despesa'}</h2>
        <CampoDescricaoComSugestoes descricao={descricao} setDescricao={setDescricao} setMostrarSugestoes={setMostrarSugestoes} sugestoes={sugestoesFiltradas} onSelecionarSugestao={selecionarSugestao} />
      </section>
      <section className="ln-secao"><h2><Tags size={18} />Classificação</h2>
        <div className="ln-cabecampo"><label htmlFor="ln-categoria">Categoria</label><button aria-label="Cadastrar nova categoria" aria-expanded={cadastroAberto === 'categoria'} onClick={() => setCadastroAberto(cadastroAberto === 'categoria' ? null : 'categoria')}><Plus size={14} />Nova</button></div>
        <select id="ln-categoria" value={categoriaId} onChange={e => {setCategoriaId(e.target.value); setSubcategoriaId(''); setCadastroAberto(null)}}>
          <option value="">Selecione a categoria</option>{categoriasFiltradas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        {cadastroAberto === 'categoria' && <CadastroRapido tipo={tipo} onCancelar={() => setCadastroAberto(null)} onSalvo={id => {setCategoriaId(String(id)); setSubcategoriaId(''); setCadastroAberto(null)}} />}
        <div className="ln-cabecampo ln-espaco"><label htmlFor="ln-subcategoria">Subcategoria · opcional</label><button disabled={!categoriaSelecionada} aria-label="Cadastrar nova subcategoria" aria-expanded={cadastroAberto === 'subcategoria'} onClick={() => setCadastroAberto(cadastroAberto === 'subcategoria' ? null : 'subcategoria')}><Plus size={14} />Nova</button></div>
        <select id="ln-subcategoria" value={subcategoriaId} disabled={!categoriaId} onChange={e => setSubcategoriaId(e.target.value)}>
          <option value="">{categoriaId ? 'Sem subcategoria' : 'Escolha uma categoria primeiro'}</option>{subcategoriasFiltradas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        {cadastroAberto === 'subcategoria' && categoriaSelecionada && <CadastroRapido key={categoriaId} categoria={categoriaSelecionada} tipo={tipo} onCancelar={() => setCadastroAberto(null)} onSalvo={id => {setSubcategoriaId(String(id)); setCadastroAberto(null)}} />}
      </section>
      <section className="ln-secao"><h2><Wallet size={18} />{tipo === 'receita' ? 'Recebimento' : 'Pagamento'}</h2>
        <div className="ln-opcoes" aria-label="Forma de pagamento">{[{id:'pix',nome:'PIX'}, {id:'dinheiro',nome:'Dinheiro'}, ...(tipo === 'despesa' ? [{id:'cartao',nome:'Cartão'}] : [])].map(m => <button key={m.id} aria-pressed={metodoPagamento === m.id} onClick={() => atualizarMetodo(m.id)}>{m.nome}</button>)}</div>
        {lancamentoCartao ? <>
          <div className="ln-grade ln-espaco">
            <label><span className="ln-label">Cartão</span><select aria-label="Cartão" value={cartaoId} onChange={e => atualizarCartao(e.target.value)}><option value="">Selecione</option>{cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}{c.bandeira ? ` · ${c.bandeira}` : ''}</option>)}</select></label>
            <label><span className="ln-label">Fatura</span><select aria-label="Fatura" value={faturaSelecionada} onChange={e => setFaturaRef(e.target.value)}>{opcoesFatura.map(f => <option key={f} value={f}>{formatarFatura(f)}</option>)}</select></label>
          </div>
          <p className="ln-ajuda">{cartoes.length ? 'Pagamento acompanhado pela fatura do cartão.' : 'Nenhum cartão ativo. Cadastre um cartão na área Cartões para continuar.'}</p>
        </> : <div className="ln-espaco"><CampoTexto label="Competência" value={dataCompetencia} onChange={atualizarDataCompetencia} type="date" /></div>}
        {mostrarStatus && tipoLancamento !== 'parcelado' && <div className="ln-espaco"><span className="ln-label">Situação</span><FiltroSegmentado valor={status} onChange={setStatus} opcoes={[{valor:'pendente',label:'Pendente'},{valor:'pago',label:'Pago'}]} /></div>}
        <label className="ln-espaco"><span className="ln-label">Tipo de lançamento</span><select aria-label="Tipo de lançamento" value={tipoLancamento} onChange={e => setTipoLancamento(e.target.value)}><option value="simples">Única vez</option><option value="parcelado">Parcelado</option><option value="fixa_mensal">Fixa mensal</option></select></label>
        {tipoLancamento === 'fixa_mensal' && <p className="ln-ajuda">Será repetido mensalmente por 12 meses, a partir da referência escolhida.</p>}
        {tipoLancamento === 'parcelado' && <div className="ln-parcelas">
          <div className="ln-opcoes ln-espaco">{[{id:'total',nome:'Valor total'},{id:'parcela',nome:'Valor da parcela'}].map(m => <button key={m.id} aria-pressed={modoValorParcelado === m.id} onClick={() => setModoValorParcelado(m.id)}>{m.nome}</button>)}</div>
          <div className="ln-grade ln-espaco">
            <label><span className="ln-label">Parcela inicial</span><input type="number" min="1" max={totalParcelas || 999} value={parcelaAtual} onChange={e => setParcelaAtual(e.target.value)} /></label>
            <label><span className="ln-label">Total de parcelas</span><input type="number" min="2" max="999" value={totalParcelas} onChange={e => setTotalParcelas(e.target.value)} /></label>
          </div>
          {parcelasValidas ? <>
            <p className="ln-resumo" aria-live="polite">{totalParcelasNumero} parcelas · Total de {moeda(parcelasPreview.reduce((a,b) => a + b, 0))}</p>
            <p className="ln-ajuda">{parcelaInicialNumero > 1 ? `As ${parcelaInicialNumero - 1} parcelas anteriores serão registradas como pagas. A referência escolhida corresponde à parcela ${parcelaInicialNumero}.` : 'As parcelas serão registradas como pendentes.'}</p>
            <div className="ln-faturas"><h3>{lancamentoCartao ? 'Nas próximas faturas' : 'Próximas parcelas'}</h3>{parcelasPreview.slice(parcelaInicialNumero - 1, parcelaInicialNumero + 2).map((v, i) => <div key={i}><span>{formatarFatura(lancamentoCartao ? adicionarMesesFatura(faturaSelecionada, i) : adicionarMeses(dataCompetencia, i).slice(0,7))}<small>Parcela {parcelaInicialNumero + i}/{totalParcelasNumero}</small></span><strong>{moeda(v)}</strong></div>)}
              {totalParcelasNumero - parcelaInicialNumero > 2 && <p className="ln-ajuda">+ {totalParcelasNumero - parcelaInicialNumero - 2} parcelas mensais</p>}
              {parcelasPreview[0] !== parcelasPreview.at(-1) && <p className="ln-ajuda">Centavos distribuídos entre as parcelas para manter o total exato.</p>}
            </div>
          </> : <p className="ln-ajuda" role="status">Informe um valor e parcelas válidas para visualizar a distribuição.</p>}
        </div>}
      </section>
      <details className="ln-secao"><summary>Observações <span>Opcional +</span></summary><textarea aria-label="Observações" value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Adicione um detalhe, se precisar." /></details>
      {erroSalvar && <p className="ln-erro" role="alert">{erroSalvar}</p>}
      <Botao disabled={salvando} onClick={salvar} className="ln-salvar"><span className="inline-flex items-center gap-2"><Save size={18} />{salvando ? 'Salvando…' : tipo === 'receita' ? 'Salvar receita' : 'Salvar despesa'}</span></Botao>
    </div>
  )
}

function CampoDescricaoComSugestoes({
  descricao,
  setDescricao,
  setMostrarSugestoes,
  sugestoes,
  onSelecionarSugestao
}) {
  const campoRef = useRef(null)

  useEffect(() => {
    const fecharAoClicarFora = (event) => {
      if (!campoRef.current?.contains(event.target)) setMostrarSugestoes(false)
    }
    document.addEventListener('pointerdown', fecharAoClicarFora, true)
    return () => document.removeEventListener('pointerdown', fecharAoClicarFora, true)
  }, [setMostrarSugestoes])

  return (
    <div
      ref={campoRef}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setMostrarSugestoes(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setMostrarSugestoes(false)
      }}
    >
      <label className="block">
        <span className="mb-2 block text-xs font-semibold text-[#91A99C]">
          Descrição
        </span>

        <input
          type="text"
          value={descricao}
          placeholder="Ex: Mercado, salário, combustível"
          onFocus={() => setMostrarSugestoes(true)}
          onChange={(event) => {
            setDescricao(event.target.value)
            setMostrarSugestoes(true)
          }}
          className="min-h-[48px] w-full rounded-2xl border border-[#1C2A24] bg-[#030504] px-4 py-3 text-sm text-[#F4FFF8] outline-none placeholder:text-[#587367] focus:border-[#3AF2A1] focus:ring-2 focus:ring-[#3AF2A1]/10"
        />
      </label>

      {sugestoes.length > 0 && (
        <div className="absolute left-0 right-0 top-[76px] z-[60] max-h-72 overflow-y-auto rounded-3xl border border-[#1C2A24] bg-[#07100B] p-2 shadow-2xl">
          <div className="mb-2 flex items-center gap-2 px-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#3AF2A1]">
            <Sparkles size={13} />
            Sugestões inteligentes
          </div>

          {sugestoes.map((sugestao) => (
            <button
              key={`${sugestao.descricao}-${sugestao.categoriaId}-${sugestao.subcategoriaId}-${sugestao.cartaoId || 'sem-cartao'}`}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelecionarSugestao(sugestao)}
              className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-[#3AF2A1]/5 active:scale-[0.99]"
            >
              {sugestao.categoria ? (
                <IconeCategoria
                  icone={sugestao.categoria.icone}
                  cor={sugestao.categoria.cor}
                  tamanho="sm"
                  ativo
                />
              ) : (
                <div className="h-10 w-10 rounded-2xl border border-[#1C2A24] bg-[#030504]" />
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-[#F4FFF8]">
                  {sugestao.descricao}
                </p>

                <p className="mt-0.5 truncate text-xs text-[#91A99C]">
                  {sugestao.categoria?.nome || 'Sem categoria'}
                  {sugestao.subcategoria?.nome ? ` · ${sugestao.subcategoria.nome}` : ''}
                </p>

                {sugestao.cartao && (
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[#587367]">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: sugestao.cartao.cor || '#0F9D58' }}
                    />
                    {sugestao.cartao.nome}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
