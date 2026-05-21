import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Filter,
  Search,
  Trash2,
  X,
  XCircle
} from 'lucide-react'

import { db, agoraISO, softDelete } from '../db/database'
import { agendarSync } from '../sync/syncManager'
import { CardPremium } from '../components/CardPremium'
import { TopoTela } from '../components/TopoTela'
import { IconeCategoria } from '../components/IconeCategoria'
import { formatarDataGrupo, normalizarDataCivil } from '../utils/datas'

const formatarMoeda = (valor) => {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
}

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

const normalizarTexto = (texto) => {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

const categoriaEhReembolso = (categoria) => {
  const nome = normalizarTexto(categoria?.nome)

  return nome === 'reembolso' || nome === 'reembolsos'
}

const obterFiltroInicial = (filtroInicial) => {
  if (typeof filtroInicial === 'object' && filtroInicial?.filtro) {
    return filtroInicial.filtro
  }

  return filtroInicial || 'todos'
}

const obterCategoriaInicial = (filtroInicial) => {
  if (typeof filtroInicial === 'object' && filtroInicial?.filtro === 'categoria') {
    return {
      id: filtroInicial.categoriaId || null,
      nome: filtroInicial.categoriaNome || ''
    }
  }

  return null
}

const obterFiltrosDetalhadosIniciais = (filtroInicial) => {
  const filtros = {
    tipo: 'todos',
    pagamento: 'todos',
    status: 'todos',
    categoriaId: 'todos',
    subcategoriaId: 'todos',
    usuarioId: 'todos',
    cartaoId: 'todos'
  }

  if (typeof filtroInicial === 'object' && filtroInicial?.filtro === 'categoria') {
    filtros.categoriaId = filtroInicial.categoriaId ? String(filtroInicial.categoriaId) : 'todos'
    return filtros
  }

  if (filtroInicial === 'receita' || filtroInicial === 'despesa') {
    filtros.tipo = filtroInicial
    return filtros
  }

  if (filtroInicial === 'pix' || filtroInicial === 'dinheiro' || filtroInicial === 'cartao') {
    filtros.pagamento = filtroInicial
    return filtros
  }

  if (filtroInicial === 'pago' || filtroInicial === 'pendente') {
    filtros.status = filtroInicial
    return filtros
  }

  return filtros
}

const formatarMes = (mesRef) => {
  const [ano, mes] = mesRef.split('-').map(Number)
  const data = new Date(ano, mes - 1, 1)
  const nomeMes = data.toLocaleDateString('pt-BR', { month: 'long' })

  return `${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}/${String(ano).slice(-2)}`
}

const alterarMes = (mesRef, deslocamento) => {
  const [ano, mes] = mesRef.split('-').map(Number)
  const data = new Date(ano, mes - 1 + deslocamento, 1)

  return data.toISOString().slice(0, 7)
}

const formatarMetodo = (metodo) => {
  const mapa = {
    pix: 'pix',
    dinheiro: 'dinheiro',
    cartao: 'cartão'
  }

  return mapa[metodo] || metodo || ''
}

const formatarFaturaRef = (faturaRef) => {
  if (!faturaRef || !String(faturaRef).includes('-')) return 'Fatura'

  const [ano, mes] = String(faturaRef).split('-').map(Number)
  const data = new Date(ano, mes - 1, 1)
  const nomeMes = data.toLocaleDateString('pt-BR', { month: 'long' })

  return `${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}/${String(ano).slice(-2)}`
}

const obterDiaVencimentoCartao = (cartao) => {
  const candidatos = [
    cartao?.vencimento,
    cartao?.diaVencimento,
    cartao?.diaVencimentoFatura
  ]

  const valor = candidatos.find((item) => Number(item) >= 1 && Number(item) <= 31)

  return valor ? Number(valor) : null
}

const obterDataVencimentoFatura = (cartao, faturaRef) => {
  if (!cartao || !faturaRef || !String(faturaRef).includes('-')) return null

  const diaVencimento = obterDiaVencimentoCartao(cartao)

  if (!diaVencimento) return null

  const [ano, mes] = String(faturaRef).split('-').map(Number)
  const ultimoDiaMes = new Date(ano, mes, 0).getDate()
  const diaFinal = Math.min(diaVencimento, ultimoDiaMes)

  return `${ano}-${String(mes).padStart(2, '0')}-${String(diaFinal).padStart(2, '0')}`
}

const faturaEstaVencida = (cartao, faturaRef, fechada) => {
  if (fechada) return false

  const dataVencimento = obterDataVencimentoFatura(cartao, faturaRef)

  if (!dataVencimento) return false

  const hoje = new Date().toISOString().slice(0, 10)

  return hoje > dataVencimento
}

const OPCOES_FILTRO = [
  { valor: 'todos', label: 'Todos' },
  { valor: 'receita', label: 'Receitas' },
  { valor: 'despesa', label: 'Despesas' },
  { valor: 'pendente', label: 'Pendentes' },
  { valor: 'pago', label: 'Pagos' },
  { valor: 'pix', label: 'PIX' },
  { valor: 'dinheiro', label: 'Dinheiro' },
  { valor: 'cartao', label: 'Cartão' }
]

export default function Extratos({ filtroInicial = 'todos', onVoltar }) {
  const filtrosIniciais = useMemo(() => obterFiltrosDetalhadosIniciais(filtroInicial), [filtroInicial])

  const [mesAtual, setMesAtual] = useState(new Date().toISOString().slice(0, 7))
  const [filtro, setFiltro] = useState(obterFiltroInicial(filtroInicial))
  const [filtroCategoria, setFiltroCategoria] = useState(obterCategoriaInicial(filtroInicial))
  const [filtroTipo, setFiltroTipo] = useState(filtrosIniciais.tipo)
  const [filtroPagamento, setFiltroPagamento] = useState(filtrosIniciais.pagamento)
  const [filtroStatus, setFiltroStatus] = useState(filtrosIniciais.status)
  const [filtroCategoriaId, setFiltroCategoriaId] = useState(filtrosIniciais.categoriaId)
  const [filtroSubcategoriaId, setFiltroSubcategoriaId] = useState(filtrosIniciais.subcategoriaId)
  const [filtroUsuarioId, setFiltroUsuarioId] = useState(filtrosIniciais.usuarioId)
  const [filtroCartaoId, setFiltroCartaoId] = useState(filtrosIniciais.cartaoId)
  const [busca, setBusca] = useState('')
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [expandidoId, setExpandidoId] = useState(null)
  const [faturaExpandidaId, setFaturaExpandidaId] = useState(null)

  const [editor, setEditor] = useState(null)
  const [descricaoEdicao, setDescricaoEdicao] = useState('')
  const [valorEdicao, setValorEdicao] = useState('')
  const [categoriaEdicaoId, setCategoriaEdicaoId] = useState('')
  const [subcategoriaEdicaoId, setSubcategoriaEdicaoId] = useState('')
  const [escopoEdicao, setEscopoEdicao] = useState('este')

  const [modalPagamento, setModalPagamento] = useState(null)
  const [valorPagamentoFatura, setValorPagamentoFatura] = useState('')

  useEffect(() => {
    const novosFiltros = obterFiltrosDetalhadosIniciais(filtroInicial)

    setFiltro(obterFiltroInicial(filtroInicial))
    setFiltroCategoria(obterCategoriaInicial(filtroInicial))
    setFiltroTipo(novosFiltros.tipo)
    setFiltroPagamento(novosFiltros.pagamento)
    setFiltroStatus(novosFiltros.status)
    setFiltroCategoriaId(novosFiltros.categoriaId)
    setFiltroSubcategoriaId(novosFiltros.subcategoriaId)
    setFiltroUsuarioId(novosFiltros.usuarioId)
    setFiltroCartaoId(novosFiltros.cartaoId)
    setBusca('')
    setBuscaAberta(false)
    setFiltrosAbertos(false)
    setExpandidoId(null)
    setFaturaExpandidaId(null)
  }, [filtroInicial])

  const lancamentos = useLiveQuery(async () => {
    const todos = await db.lancamentos.toArray()
    return todos.filter((lancamento) => !lancamento.deletedAt)
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
    return todos.filter((cartao) => !cartao.deletedAt)
  }, [])

  const filtrosAtivos = useMemo(() => {
    return (
      filtroTipo !== 'todos' ||
      filtroPagamento !== 'todos' ||
      filtroStatus !== 'todos' ||
      filtroCategoriaId !== 'todos' ||
      filtroSubcategoriaId !== 'todos' ||
      filtroUsuarioId !== 'todos' ||
      filtroCartaoId !== 'todos'
    )
  }, [
    filtroTipo,
    filtroPagamento,
    filtroStatus,
    filtroCategoriaId,
    filtroSubcategoriaId,
    filtroUsuarioId,
    filtroCartaoId
  ])


  const dadosEnriquecidos = useMemo(() => {
    if (!lancamentos || !categorias || !subcategorias || !cartoes) return []

    return lancamentos.map((lancamento) => {
      const categoria = categorias.find((item) => item.id === Number(lancamento.categoriaId))
      const subcategoria = subcategorias.find((item) => item.id === Number(lancamento.subcategoriaId))
      const cartao = cartoes.find((item) => item.id === Number(lancamento.cartaoId))

      return {
        ...lancamento,
        dataCompetencia: normalizarDataCivil(lancamento.dataCompetencia),
        dataPagamento: normalizarDataCivil(lancamento.dataPagamento),
        categoria,
        subcategoria,
        cartao
      }
    })
  }, [lancamentos, categorias, subcategorias, cartoes])

  const subcategoriasFiltradas = useMemo(() => {
    if (!subcategorias || filtroCategoriaId === 'todos') return []

    return subcategorias.filter(
      (subcategoria) => Number(subcategoria.categoriaId) === Number(filtroCategoriaId)
    )
  }, [subcategorias, filtroCategoriaId])

  const lancamentosFiltrados = useMemo(() => {
    const termo = normalizarTexto(busca)

    return dadosEnriquecidos
      .filter((lancamento) => {
        if (lancamento.metodoPagamento === 'cartao') {
          return String(lancamento.faturaRef || '').startsWith(mesAtual)
        }

        return normalizarDataCivil(lancamento.dataCompetencia).startsWith(mesAtual)
      })
      .filter((lancamento) => {
        if (!categoriaEhReembolso(lancamento.categoria)) return true

        const reembolsoSelecionadoNoDropdown =
          filtroCategoriaId !== 'todos' &&
          Number(lancamento.categoriaId) === Number(filtroCategoriaId)

        const reembolsoSelecionadoViaFiltroInicial =
          filtro === 'categoria' &&
          filtroCategoria?.id &&
          Number(lancamento.categoriaId) === Number(filtroCategoria.id)

        return reembolsoSelecionadoNoDropdown || reembolsoSelecionadoViaFiltroInicial
      })
      .filter((lancamento) => {
        if (filtroTipo === 'todos') return true
        return lancamento.tipo === filtroTipo
      })
      .filter((lancamento) => {
        if (filtroPagamento === 'todos') return true
        return lancamento.metodoPagamento === filtroPagamento
      })
      .filter((lancamento) => {
        if (filtroStatus === 'todos') return true

        if (filtroStatus === 'pago') {
          if (lancamento.metodoPagamento === 'cartao') {
            return Boolean(lancamento.faturaFechada)
          }

          return lancamento.status === 'pago'
        }

        if (filtroStatus === 'pendente') {
          if (lancamento.metodoPagamento === 'cartao') {
            return !lancamento.faturaFechada
          }

          return lancamento.status === 'pendente'
        }

        return true
      })
      .filter((lancamento) => {
        if (filtroCategoriaId === 'todos') return true
        return Number(lancamento.categoriaId) === Number(filtroCategoriaId)
      })
      .filter((lancamento) => {
        if (filtroSubcategoriaId === 'todos') return true
        return Number(lancamento.subcategoriaId) === Number(filtroSubcategoriaId)
      })
      .filter((lancamento) => {
        if (filtroUsuarioId === 'todos') return true
        return Number(lancamento.usuarioId) === Number(filtroUsuarioId)
      })
      .filter((lancamento) => {
        if (filtroCartaoId === 'todos') return true
        return Number(lancamento.cartaoId) === Number(filtroCartaoId)
      })
      .filter((lancamento) => {
        if (!termo) return true

        const texto = [
          lancamento.descricao,
          lancamento.categoria?.nome,
          lancamento.subcategoria?.nome,
          lancamento.cartao?.nome,
          lancamento.observacoes
        ].join(' ')

        return normalizarTexto(texto).includes(termo)
      })
      .sort((a, b) => {
        const dataA = normalizarDataCivil(a.dataCompetencia)
        const dataB = normalizarDataCivil(b.dataCompetencia)

        return dataB.localeCompare(dataA)
      })
  }, [
    dadosEnriquecidos,
    mesAtual,
    filtroTipo,
    filtroPagamento,
    filtroStatus,
    filtroCategoriaId,
    filtroSubcategoriaId,
    filtroUsuarioId,
    filtroCartaoId,
    busca
  ])

  const resumo = useMemo(() => {
    const receitas = lancamentosFiltrados
      .filter((lancamento) => lancamento.tipo === 'receita')
      .reduce((total, item) => total + Number(item.valor || 0), 0)

    const despesas = lancamentosFiltrados
      .filter((lancamento) => lancamento.tipo === 'despesa')
      .reduce((total, item) => total + Number(item.valor || 0), 0)

    return {
      receitas,
      despesas,
      saldo: receitas - despesas
    }
  }, [lancamentosFiltrados])

  const faturasCartao = useMemo(() => {
    const mapa = new Map()

    const itensCartao = lancamentosFiltrados.filter(
      (lancamento) => lancamento.metodoPagamento === 'cartao'
    )

    for (const lancamento of itensCartao) {
      const cartaoId = lancamento.cartaoId || 'sem-cartao'
      const faturaRef = lancamento.faturaRef || mesAtual
      const chave = `${cartaoId}-${faturaRef}`

      if (!mapa.has(chave)) {
        mapa.set(chave, {
          id: chave,
          cartaoId,
          faturaRef,
          cartao: lancamento.cartao,
          itens: [],
          total: 0,
          valorPago: 0,
          fechada: false,
          vencida: false
        })
      }

      const grupo = mapa.get(chave)
      grupo.itens.push(lancamento)
      grupo.total += Number(lancamento.valor || 0)
    }

    const lista = Array.from(mapa.values()).map((fatura) => {
      const valoresPagos = fatura.itens.map((item) => Number(item.faturaValorPago || 0))
      const valorPago = valoresPagos.length > 0 ? Math.max(...valoresPagos) : 0
      const fechadaPorCampo = fatura.itens.some((item) => Boolean(item.faturaFechada))
      const fechadaPorValor = valorPago >= fatura.total && fatura.total > 0
      const fechada = fechadaPorCampo || fechadaPorValor

      return {
        ...fatura,
        valorPago,
        fechada,
        vencida: faturaEstaVencida(fatura.cartao, fatura.faturaRef, fechada)
      }
    })

    return lista.sort((a, b) => {
      const nomeA = a.cartao?.nome || ''
      const nomeB = b.cartao?.nome || ''

      return nomeA.localeCompare(nomeB)
    })
  }, [lancamentosFiltrados, mesAtual])

  const gruposNaoCartao = useMemo(() => {
    const mapa = new Map()

    const itensNaoCartao = lancamentosFiltrados.filter(
      (lancamento) => lancamento.metodoPagamento !== 'cartao'
    )

    for (const lancamento of itensNaoCartao) {
      const data = normalizarDataCivil(lancamento.dataCompetencia) || 'Sem data'

      if (!mapa.has(data)) {
        mapa.set(data, [])
      }

      mapa.get(data).push(lancamento)
    }

    return Array.from(mapa.entries())
  }, [lancamentosFiltrados])

  const limparFiltroCategoria = () => {
    setFiltro('todos')
    setFiltroCategoria(null)
    setFiltroCategoriaId('todos')
    setFiltroSubcategoriaId('todos')
  }

  const limparFiltrosDetalhados = () => {
    setFiltro('todos')
    setFiltroCategoria(null)
    setFiltroTipo('todos')
    setFiltroPagamento('todos')
    setFiltroStatus('todos')
    setFiltroCategoriaId('todos')
    setFiltroSubcategoriaId('todos')
    setFiltroUsuarioId('todos')
    setFiltroCartaoId('todos')
  }

  const abrirEditorDescricao = (lancamento) => {
    setEditor({ tipo: 'descricao', lancamento })
    setDescricaoEdicao(lancamento.descricao || '')
    setEscopoEdicao('este')
  }

  const abrirEditorValor = (lancamento) => {
    setEditor({ tipo: 'valor', lancamento })
    setValorEdicao(formatarCampoMoeda(String(Math.round(Number(lancamento.valor || 0) * 100))))
    setEscopoEdicao('este')
  }

  const abrirEditorCategoria = (lancamento) => {
    setEditor({ tipo: 'categoria', lancamento })
    setCategoriaEdicaoId(String(lancamento.categoriaId || ''))
    setSubcategoriaEdicaoId(String(lancamento.subcategoriaId || ''))
    setEscopoEdicao('este')
  }

  const fecharEditor = () => {
    setEditor(null)
    setDescricaoEdicao('')
    setValorEdicao('')
    setCategoriaEdicaoId('')
    setSubcategoriaEdicaoId('')
    setEscopoEdicao('este')
  }

  const abrirPagamentoFatura = (fatura) => {
    if (fatura.fechada) {
      const confirmar = confirm(`Reabrir a fatura ${formatarFaturaRef(fatura.faturaRef)} do cartão ${fatura.cartao?.nome || 'Cartão'}?`)

      if (!confirmar) return

      reabrirFatura(fatura)
      return
    }

    const saldoPendente = Math.max(Number(fatura.total || 0) - Number(fatura.valorPago || 0), 0)

    setModalPagamento(fatura)
    setValorPagamentoFatura(formatarCampoMoeda(String(Math.round(saldoPendente * 100))))
  }

  const fecharModalPagamento = () => {
    setModalPagamento(null)
    setValorPagamentoFatura('')
  }

  const salvarPagamentoFatura = async () => {
    if (!modalPagamento) return

    const valorInformado = moedaParaNumero(valorPagamentoFatura)

    if (!valorInformado || valorInformado <= 0) {
      alert('Informe um valor válido para pagamento.')
      return
    }

    const valorPagoAnterior = Number(modalPagamento.valorPago || 0)
    const novoValorPago = Math.min(valorPagoAnterior + valorInformado, Number(modalPagamento.total || 0))
    const faturaFechada = novoValorPago >= Number(modalPagamento.total || 0)
    const agora = agoraISO()
    const dataPagamento = new Date().toISOString().slice(0, 10)

    for (const item of modalPagamento.itens) {
      await db.lancamentos.update(item.id, {
        faturaValorPago: novoValorPago,
        faturaFechada,
        status: faturaFechada ? 'pago' : 'pendente',
        dataPagamento: faturaFechada ? dataPagamento : null,
        updatedAt: agora,
        syncStatus: 'pending'
      })
    }

    agendarSync()
    fecharModalPagamento()
  }

  const reabrirFatura = async (fatura) => {
    const agora = agoraISO()

    for (const item of fatura.itens) {
      await db.lancamentos.update(item.id, {
        faturaValorPago: 0,
        faturaFechada: false,
        status: 'pendente',
        dataPagamento: null,
        updatedAt: agora,
        syncStatus: 'pending'
      })
    }

    agendarSync()
  }

  const obterRelacionados = (lancamento, escopo) => {
    if (!lancamentos) return []

    const chave = lancamento.parcelamentoId
      ? 'parcelamentoId'
      : lancamento.recorrenciaId
        ? 'recorrenciaId'
        : null

    if (!chave || escopo === 'este') {
      return [lancamento]
    }

    const valorChave = lancamento[chave]

    let relacionados = lancamentos.filter(
      (item) => !item.deletedAt && item[chave] && item[chave] === valorChave
    )

    if (escopo === 'a_partir') {
      relacionados = relacionados.filter((item) => {
        if (chave === 'parcelamentoId') {
          return Number(item.parcelaAtual || 0) >= Number(lancamento.parcelaAtual || 0)
        }

        return normalizarDataCivil(item.dataCompetencia) >= normalizarDataCivil(lancamento.dataCompetencia)
      })
    }

    return relacionados.length > 0 ? relacionados : [lancamento]
  }

  const salvarEdicao = async () => {
    if (!editor?.lancamento) return

    const lancamento = editor.lancamento
    const agora = agoraISO()
    const registros = obterRelacionados(lancamento, escopoEdicao)

    let alteracoes = null

    if (editor.tipo === 'descricao') {
      const descricaoFinal = descricaoEdicao.trim()

      if (!descricaoFinal) {
        alert('Informe uma descrição válida.')
        return
      }

      alteracoes = {
        descricao: descricaoFinal,
        updatedAt: agora,
        syncStatus: 'pending'
      }
    }

    if (editor.tipo === 'valor') {
      const valorFinal = moedaParaNumero(valorEdicao)

      if (!valorFinal || valorFinal <= 0) {
        alert('Informe um valor válido.')
        return
      }

      alteracoes = {
        valor: valorFinal,
        updatedAt: agora,
        syncStatus: 'pending'
      }
    }

    if (editor.tipo === 'categoria') {
      if (!categoriaEdicaoId) {
        alert('Selecione uma categoria.')
        return
      }

      if (!subcategoriaEdicaoId) {
        alert('Selecione uma subcategoria.')
        return
      }

      alteracoes = {
        categoriaId: Number(categoriaEdicaoId),
        subcategoriaId: Number(subcategoriaEdicaoId),
        updatedAt: agora,
        syncStatus: 'pending'
      }
    }

    if (!alteracoes) return

    for (const item of registros) {
      await db.lancamentos.update(item.id, alteracoes)
    }

    agendarSync()
    fecharEditor()
  }

  const possuiRelacionados = Boolean(editor?.lancamento?.parcelamentoId || editor?.lancamento?.recorrenciaId)

  const categoriasEditor = useMemo(() => {
    if (!categorias || !editor?.lancamento) return []

    return categorias.filter(
      (categoria) =>
        categoria.tipo === editor.lancamento.tipo ||
        categoria.tipo === 'ambos'
    )
  }, [categorias, editor])

  const subcategoriasEditor = useMemo(() => {
    if (!subcategorias || !categoriaEdicaoId) return []

    return subcategorias.filter(
      (subcategoria) => subcategoria.categoriaId === Number(categoriaEdicaoId)
    )
  }, [subcategorias, categoriaEdicaoId])

  if (!lancamentos || !categorias || !subcategorias || !cartoes) {
    return (
      <div className="space-y-4 pb-24">
        <TopoTela titulo="Extratos" subtitulo="Carregando histórico financeiro..." />
      </div>
    )
  }

  return (
    <div className="space-y-3 pb-24">
      <div className="flex items-start gap-3">
        <button
          onClick={onVoltar}
          className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-[#D8E6DE] active:scale-95"
        >
          <ArrowLeft size={26} />
        </button>

        <div>
          <h1 className="text-3xl font-black leading-8 tracking-tight text-[#F4FFF8]">
            Extratos
          </h1>
          <p className="mt-0.5 text-sm text-[#91A99C]">
            Histórico organizado por fatura e data
          </p>
        </div>
      </div>

      <CardPremium className="space-y-2.5 rounded-[24px] border-[#1C3D2E] bg-[#03130C]/90 p-3 shadow-[0_0_30px_rgba(58,242,161,0.08)]">
        <div className="grid grid-cols-[44px_1fr_44px_44px_44px] gap-2">
          <BotaoIcone onClick={() => setMesAtual((atual) => alterarMes(atual, -1))}>
            <ChevronLeft size={24} />
          </BotaoIcone>

          <button className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-[#1C3D2E] bg-black/45 px-3 text-center text-base font-black text-[#F4FFF8]">
            {formatarMes(mesAtual)}
            <ChevronDown size={17} className="text-[#91A99C]" />
          </button>

          <BotaoIcone onClick={() => setMesAtual((atual) => alterarMes(atual, 1))}>
            <ChevronRight size={24} />
          </BotaoIcone>

          <BotaoIcone
            ativo={buscaAberta || Boolean(busca)}
            onClick={() => {
              setBuscaAberta((atual) => !atual)
              setFiltrosAbertos(false)
            }}
          >
            {buscaAberta ? <X size={20} /> : <Search size={23} />}
          </BotaoIcone>

          <BotaoIcone
            ativo={filtrosAtivos}
            onClick={() => {
              setFiltrosAbertos((atual) => !atual)
              setBuscaAberta(false)
            }}
          >
            <span className="relative">
              <Filter size={22} />
              {filtro !== 'todos' && (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#3AF2A1]" />
              )}
            </span>
          </BotaoIcone>
        </div>



        {buscaAberta && (
          <div className="relative">
            <Search
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-[#587367]"
            />

            <input
              autoFocus
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar descrição, categoria, cartão..."
              className="min-h-[44px] w-full rounded-2xl border border-[#1C3D2E] bg-black/45 py-2.5 pl-10 pr-4 text-sm text-[#F4FFF8] outline-none placeholder:text-[#587367] focus:border-[#3AF2A1]"
            />
          </div>
        )}

        {filtrosAbertos && (
          <div className="space-y-3 rounded-3xl border border-[#1C3D2E] bg-black/45 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <FiltroSelect
                titulo="Tipo"
                value={filtroTipo}
                onChange={setFiltroTipo}
                opcoes={[
                  ['todos', 'Todas'],
                  ['despesa', 'Despesas'],
                  ['receita', 'Receitas']
                ]}
              />

              <FiltroSelect
                titulo="Pagamento"
                value={filtroPagamento}
                onChange={setFiltroPagamento}
                opcoes={[
                  ['todos', 'Todos'],
                  ['cartao', 'Cartão'],
                  ['pix', 'PIX'],
                  ['dinheiro', 'Dinheiro']
                ]}
              />

              <FiltroSelect
                titulo="Status"
                value={filtroStatus}
                onChange={setFiltroStatus}
                opcoes={[
                  ['todos', 'Todos'],
                  ['pago', 'Pago'],
                  ['pendente', 'Pendente']
                ]}
              />

              <div>
                <TituloFiltro>Categoria</TituloFiltro>

                <select
                  value={filtroCategoriaId}
                  onChange={(event) => {
                    setFiltro('todos')
                    setFiltroCategoria(null)
                    setFiltroCategoriaId(event.target.value)
                    setFiltroSubcategoriaId('todos')
                  }}
                  className="min-h-[42px] w-full rounded-2xl border border-[#1C3D2E] bg-[#030504] px-3 text-sm font-semibold text-[#F4FFF8] outline-none"
                >
                  <option value="todos">Todas</option>
                  {categorias.map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>
                      {categoria.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <TituloFiltro>Subcategoria</TituloFiltro>

                <select
                  disabled={filtroCategoriaId === 'todos'}
                  value={filtroSubcategoriaId}
                  onChange={(event) => setFiltroSubcategoriaId(event.target.value)}
                  className="min-h-[42px] w-full rounded-2xl border border-[#1C3D2E] bg-[#030504] px-3 text-sm font-semibold text-[#F4FFF8] outline-none disabled:opacity-50"
                >
                  <option value="todos">Todas</option>
                  {subcategoriasFiltradas.map((subcategoria) => (
                    <option key={subcategoria.id} value={subcategoria.id}>
                      {subcategoria.nome}
                    </option>
                  ))}
                </select>
              </div>

              <FiltroSelect
                titulo="Quem lançou"
                value={filtroUsuarioId}
                onChange={setFiltroUsuarioId}
                opcoes={[
                  ['todos', 'Todos'],
                  ['1', 'PK'],
                  ['2', 'Grazi']
                ]}
              />

              <div>
                <TituloFiltro>Cartão</TituloFiltro>

                <select
                  value={filtroCartaoId}
                  onChange={(event) => setFiltroCartaoId(event.target.value)}
                  className="min-h-[42px] w-full rounded-2xl border border-[#1C3D2E] bg-[#030504] px-3 text-sm font-semibold text-[#F4FFF8] outline-none"
                >
                  <option value="todos">Todos</option>
                  {cartoes.map((cartao) => (
                    <option key={cartao.id} value={cartao.id}>
                      {cartao.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filtrosAtivos && (
              <button
                onClick={limparFiltrosDetalhados}
                className="min-h-[38px] w-full rounded-2xl border border-[#1C3D2E] bg-black/35 px-3 text-xs font-black text-[#91A99C] transition active:scale-[0.98]"
              >
                Limpar filtros
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-[#1C3D2E] bg-black/40">
          <ResumoTopo titulo="Receitas" valor={resumo.receitas} positivo />
          <ResumoTopo titulo="Despesas" valor={resumo.despesas} />
          <ResumoTopo titulo="Saldo" valor={resumo.saldo} positivo={resumo.saldo >= 0} semBorda />
        </div>
      </CardPremium>

      <section className="space-y-3">
        {faturasCartao.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-end justify-between px-2">
              <p className="text-xl font-black leading-6 tracking-tight text-[#F4FFF8]">
                Faturas
              </p>

              <p className="text-sm font-semibold text-[#3AF2A1]">
                {faturasCartao.length} {faturasCartao.length === 1 ? 'fatura' : 'faturas'}
              </p>
            </div>

            <div className="space-y-3">
              {faturasCartao.map((fatura) => (
                <CardFatura
                  key={fatura.id}
                  fatura={fatura}
                  expandida={faturaExpandidaId === fatura.id}
                  onAlternarPagamento={() => abrirPagamentoFatura(fatura)}
                  onAlternarExpansao={() =>
                    setFaturaExpandidaId((atual) => (atual === fatura.id ? null : fatura.id))
                  }
                  onEditarDescricao={abrirEditorDescricao}
                  onEditarValor={abrirEditorValor}
                  onEditarCategoria={abrirEditorCategoria}
                  expandidoId={expandidoId}
                  setExpandidoId={setExpandidoId}
                />
              ))}
            </div>
          </div>
        )}

        {gruposNaoCartao.map(([data, itens]) => (
          <div key={data} className="space-y-1.5">
            <div className="flex items-end justify-between px-2">
              <p className="text-xl font-black leading-6 tracking-tight text-[#F4FFF8]">
                {formatarDataGrupo(data)}
              </p>

              <p className="text-sm font-semibold text-[#3AF2A1]">
                {itens.length} {itens.length === 1 ? 'lançamento' : 'lançamentos'}
              </p>
            </div>

            <GrupoExtratos
              itens={itens}
              expandidoId={expandidoId}
              setExpandidoId={setExpandidoId}
              onEditarDescricao={abrirEditorDescricao}
              onEditarValor={abrirEditorValor}
              onEditarCategoria={abrirEditorCategoria}
            />
          </div>
        ))}

        {faturasCartao.length === 0 && gruposNaoCartao.length === 0 && (
          <CardPremium>
            <p className="text-sm font-semibold text-[#91A99C]">
              Nenhum lançamento encontrado para os filtros selecionados.
            </p>
          </CardPremium>
        )}
      </section>

      {editor && (
        <EditorRapido
          editor={editor}
          descricaoEdicao={descricaoEdicao}
          setDescricaoEdicao={setDescricaoEdicao}
          valorEdicao={valorEdicao}
          setValorEdicao={setValorEdicao}
          categoriaEdicaoId={categoriaEdicaoId}
          setCategoriaEdicaoId={(valor) => {
            setCategoriaEdicaoId(valor)
            setSubcategoriaEdicaoId('')
          }}
          subcategoriaEdicaoId={subcategoriaEdicaoId}
          setSubcategoriaEdicaoId={setSubcategoriaEdicaoId}
          categoriasEditor={categoriasEditor}
          subcategoriasEditor={subcategoriasEditor}
          escopoEdicao={escopoEdicao}
          setEscopoEdicao={setEscopoEdicao}
          possuiRelacionados={possuiRelacionados}
          onSalvar={salvarEdicao}
          onFechar={fecharEditor}
        />
      )}

      {modalPagamento && (
        <ModalPagamentoFatura
          fatura={modalPagamento}
          valorPagamentoFatura={valorPagamentoFatura}
          setValorPagamentoFatura={setValorPagamentoFatura}
          onSalvar={salvarPagamentoFatura}
          onFechar={fecharModalPagamento}
        />
      )}
    </div>
  )
}

function BotaoIcone({ children, onClick, ativo = false }) {
  return (
    <button
      onClick={onClick}
      className={`
        flex min-h-[44px] items-center justify-center rounded-2xl border transition active:scale-95
        ${
          ativo
            ? 'border-[#3AF2A1]/50 bg-[#3AF2A1]/10 text-[#3AF2A1]'
            : 'border-[#1C3D2E] bg-black/45 text-[#F4FFF8]'
        }
      `}
    >
      {children}
    </button>
  )
}

function ResumoTopo({ titulo, valor, positivo = false, semBorda = false }) {
  return (
    <div className={`px-2 py-2 text-center ${semBorda ? '' : 'border-r border-[#1C3D2E]'}`}>
      <p className="text-[11px] leading-4 text-[#D8E6DE]">{titulo}</p>
      <p className={`mt-0.5 text-sm font-black leading-4 ${positivo ? 'text-[#3AF2A1]' : 'text-red-300'}`}>
        {formatarMoeda(valor)}
      </p>
    </div>
  )
}

function CardFatura({
  fatura,
  expandida,
  onAlternarPagamento,
  onAlternarExpansao,
  onEditarDescricao,
  onEditarValor,
  onEditarCategoria,
  expandidoId,
  setExpandidoId
}) {
  const corStatus = fatura.vencida
    ? 'text-red-300 border-red-900/60 bg-red-950/30'
    : fatura.fechada
      ? 'text-[#3AF2A1] border-[#3AF2A1]/40 bg-[#3AF2A1]/10'
      : 'text-yellow-300 border-yellow-700/40 bg-yellow-950/20'

  const textoStatus = fatura.fechada
    ? 'Fechada'
    : fatura.valorPago > 0
      ? 'Parcial'
      : fatura.vencida
        ? 'Vencida'
        : 'Aberta'

  return (
    <CardPremium className="overflow-hidden rounded-[20px] border-[#1C3D2E] bg-[#03130C]/90 p-0 shadow-[0_0_22px_rgba(58,242,161,0.06)]">
      <div className="grid min-h-[44px] w-full grid-cols-[44px_minmax(0,1fr)_auto_32px] items-center gap-2 px-3 py-0.5">
        <button
          onClick={onAlternarPagamento}
          className={`flex h-9 w-9 items-center justify-center rounded-2xl border transition active:scale-95 ${corStatus}`}
          title={textoStatus}
        >
          {fatura.fechada ? <CheckCircle2 size={18} /> : fatura.vencida ? <XCircle size={18} /> : <CreditCard size={18} />}
        </button>

        <div className="min-w-0">
          <p className="truncate text-[13px] font-black leading-[15px] text-[#F4FFF8]">
            {fatura.cartao?.nome || 'Cartão'}
          </p>

          <p className="mt-[1px] truncate text-[10.5px] font-semibold leading-[12px] text-[#91A99C]">
            {formatarFaturaRef(fatura.faturaRef)} • {textoStatus}
            {fatura.valorPago > 0 && !fatura.fechada ? ` • Pago ${formatarMoeda(fatura.valorPago)}` : ''}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="whitespace-nowrap text-[12.5px] font-black leading-[14px] text-red-300">
            {formatarMoeda(fatura.total)}
          </p>

          <p className="mt-[1px] text-[10px] font-semibold leading-[11px] text-[#B5CFC1]">
            {fatura.itens.length} {fatura.itens.length === 1 ? 'item' : 'itens'}
          </p>
        </div>

        <button
          onClick={onAlternarExpansao}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-[#B5CFC1] active:scale-95"
        >
          <ChevronDown
            size={15}
            className={`transition ${expandida ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      <div
        className={`grid transition-all duration-300 ease-out ${
          expandida ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="space-y-2 border-t border-[#1C3D2E]/70 p-2">
            {fatura.itens.map((lancamento) => (
              <CardExtrato
                key={lancamento.id}
                lancamento={lancamento}
                expandido={expandidoId === lancamento.id}
                controlePorFatura
                onToggle={() =>
                  setExpandidoId((atual) => (atual === lancamento.id ? null : lancamento.id))
                }
                onEditarDescricao={onEditarDescricao}
                onEditarValor={onEditarValor}
                onEditarCategoria={onEditarCategoria}
              />
            ))}
          </div>
        </div>
      </div>
    </CardPremium>
  )
}

function GrupoExtratos({
  itens,
  expandidoId,
  setExpandidoId,
  onEditarDescricao,
  onEditarValor,
  onEditarCategoria
}) {
  return (
    <div className="space-y-3">
      {itens.map((lancamento) => (
        <CardExtrato
          key={lancamento.id}
          lancamento={lancamento}
          expandido={expandidoId === lancamento.id}
          onToggle={() =>
            setExpandidoId((atual) => (atual === lancamento.id ? null : lancamento.id))
          }
          onEditarDescricao={onEditarDescricao}
          onEditarValor={onEditarValor}
          onEditarCategoria={onEditarCategoria}
        />
      ))}
    </div>
  )
}

function CardExtrato({
  lancamento,
  expandido,
  onToggle,
  onEditarDescricao,
  onEditarValor,
  onEditarCategoria,
  controlePorFatura = false
}) {
  const positivo = lancamento.tipo === 'receita'

  const alternarStatus = async () => {
    const novoStatus = lancamento.status === 'pago' ? 'pendente' : 'pago'

    await db.lancamentos.update(lancamento.id, {
      status: novoStatus,
      dataPagamento: novoStatus === 'pago' ? normalizarDataCivil(lancamento.dataCompetencia) : null,
      updatedAt: agoraISO(),
      syncStatus: 'pending'
    })

    agendarSync()
  }

  const excluir = async () => {
    const confirmar = confirm(`Excluir "${lancamento.descricao}"?`)

    if (!confirmar) return

    await softDelete('lancamentos', lancamento.id)
    agendarSync()
  }

  return (
    <CardPremium className="overflow-hidden rounded-[20px] border-[#1C3D2E] bg-[#03130C]/90 p-0 shadow-[0_0_22px_rgba(58,242,161,0.06)]">
      <button
        onClick={onToggle}
        className="grid min-h-[14px] w-full grid-cols-[54px_minmax(0,1fr)_auto_14px] items-center gap-1 px-3 py-0.5 text-left active:scale-[0.995]"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden">
          <div className="origin-center scale-[0.90]">
            <IconeCategoria
              icone={lancamento.categoria?.icone}
              cor={lancamento.categoria?.cor}
              tamanho="sm"
            />
          </div>
        </div>

        <div className="min-w-0 overflow-hidden">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onEditarDescricao(lancamento)
            }}
            className="block max-w-full truncate text-left text-[12.5px] font-black leading-[14px] text-[#F4FFF8]"
          >
            {lancamento.descricao}
            {lancamento.parcelaAtual && lancamento.totalParcelas
              ? ` · ${lancamento.parcelaAtual}/${lancamento.totalParcelas}`
              : ''}
            {lancamento.recorrente ? ' · Fixa mensal' : ''}
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onEditarCategoria(lancamento)
            }}
            className="mt-[1px] block max-w-full truncate text-left text-[10.5px] leading-[12px] text-[#B5CFC1]"
          >
            {lancamento.categoria?.nome || 'Sem categoria'}
            {lancamento.subcategoria?.nome ? ` • ${lancamento.subcategoria.nome}` : ''}
          </button>

          <p className="mt-[1px] truncate text-[10px] leading-[11px] text-[#91A99C]">
            {formatarMetodo(lancamento.metodoPagamento)}
            {lancamento.cartao ? ` • ${lancamento.cartao.nome}` : ''}
          </p>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onEditarValor(lancamento)
          }}
          className="shrink-0 text-right"
        >
          <p className={`whitespace-nowrap text-[12.5px] font-black leading-[14px] ${positivo ? 'text-[#3AF2A1]' : 'text-red-300'}`}>
            {positivo ? '+' : '-'} {formatarMoeda(lancamento.valor)}
          </p>

          <p className={`mt-[1px] text-[10px] font-semibold capitalize leading-[11px] ${
            lancamento.status === 'pendente' ? 'text-yellow-400' : 'text-[#B5CFC1]'
          }`}
          >
            {controlePorFatura ? 'na fatura' : lancamento.status}
          </p>
        </button>

        <ChevronDown
          size={13}
          className={`shrink-0 text-[#B5CFC1] transition ${expandido ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        className={`grid transition-all duration-300 ease-out ${
          expandido ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="space-y-1.5 px-3 pb-1 pt-1.5">
            {lancamento.observacoes && (
              <p className="rounded-2xl border border-[#1C3D2E] bg-black/35 p-2 text-[11px] leading-4 text-[#91A99C]">
                {lancamento.observacoes}
              </p>
            )}

            {controlePorFatura ? (
              <button
                onClick={excluir}
                className="flex min-h-[32px] w-full items-center justify-center gap-1.5 rounded-2xl border border-red-900/60 bg-red-950/30 text-[11px] font-black text-red-300 active:scale-[0.98]"
              >
                <Trash2 size={13} />
                Excluir lançamento
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2 translate-y-1">
                <button
                  onClick={alternarStatus}
                  className="flex min-h-[32px] items-center justify-center gap-1.5 rounded-2xl border border-[#1C3D2E] bg-black/35 text-[11px] font-black text-[#3AF2A1] active:scale-[0.98]"
                >
                  {lancamento.status === 'pago' ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
                  {lancamento.status === 'pago' ? 'Pendente' : 'Pago'}
                </button>

                <button
                  onClick={excluir}
                  className="flex min-h-[32px] items-center justify-center gap-1.5 rounded-2xl border border-red-900/60 bg-red-950/30 text-[11px] font-black text-red-300 active:scale-[0.98]"
                >
                  <Trash2 size={13} />
                  Excluir
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </CardPremium>
  )
}

function ModalPagamentoFatura({
  fatura,
  valorPagamentoFatura,
  setValorPagamentoFatura,
  onSalvar,
  onFechar
}) {
  const saldoPendente = Math.max(Number(fatura.total || 0) - Number(fatura.valorPago || 0), 0)

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/70 px-4 pb-4 backdrop-blur-sm">
      <div className="w-full max-w-[430px] rounded-[30px] border border-[#1C3D2E] bg-[#03130C] p-4 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#3AF2A1]">
              Pagamento de fatura
            </p>
            <h2 className="mt-1 text-xl font-black text-[#F4FFF8]">
              {fatura.cartao?.nome || 'Cartão'}
            </h2>
            <p className="mt-1 text-xs text-[#91A99C]">
              {formatarFaturaRef(fatura.faturaRef)} • Pendente {formatarMoeda(saldoPendente)}
            </p>
          </div>

          <button
            onClick={onFechar}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#1C3D2E] bg-black/40 text-[#91A99C]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-[#1C3D2E] bg-black/40">
            <ResumoTopo titulo="Total" valor={fatura.total} />
            <ResumoTopo titulo="Pago" valor={fatura.valorPago} positivo />
            <ResumoTopo titulo="Restante" valor={saldoPendente} semBorda />
          </div>

          <input
            autoFocus
            value={valorPagamentoFatura}
            inputMode="numeric"
            onChange={(event) => setValorPagamentoFatura(formatarCampoMoeda(event.target.value))}
            className="min-h-[52px] w-full rounded-2xl border border-[#1C3D2E] bg-black/45 px-4 py-3 text-center text-xl font-black text-[#F4FFF8] outline-none focus:border-[#3AF2A1]"
          />

          <button
            onClick={onSalvar}
            className="min-h-[48px] w-full rounded-2xl bg-gradient-to-br from-[#3AF2A1] via-[#0F9D58] to-[#021A10] text-sm font-black text-white shadow-[0_0_24px_rgba(58,242,161,0.22)] active:scale-[0.98]"
          >
            Confirmar pagamento
          </button>
        </div>
      </div>
    </div>
  )
}

function EditorRapido({
  editor,
  descricaoEdicao,
  setDescricaoEdicao,
  valorEdicao,
  setValorEdicao,
  categoriaEdicaoId,
  setCategoriaEdicaoId,
  subcategoriaEdicaoId,
  setSubcategoriaEdicaoId,
  categoriasEditor,
  subcategoriasEditor,
  escopoEdicao,
  setEscopoEdicao,
  possuiRelacionados,
  onSalvar,
  onFechar
}) {
  const titulo = {
    descricao: 'Editar descrição',
    valor: 'Editar valor',
    categoria: 'Editar categoria'
  }[editor.tipo]

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 px-4 pb-4 backdrop-blur-sm">
      <div className="w-full max-w-[430px] rounded-[30px] border border-[#1C3D2E] bg-[#03130C] p-4 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#3AF2A1]">
              Edição rápida
            </p>
            <h2 className="mt-1 text-xl font-black text-[#F4FFF8]">
              {titulo}
            </h2>
          </div>

          <button
            onClick={onFechar}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#1C3D2E] bg-black/40 text-[#91A99C]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          {editor.tipo === 'descricao' && (
            <input
              autoFocus
              value={descricaoEdicao}
              onChange={(event) => setDescricaoEdicao(event.target.value)}
              className="min-h-[48px] w-full rounded-2xl border border-[#1C3D2E] bg-black/45 px-4 py-3 text-sm font-semibold text-[#F4FFF8] outline-none focus:border-[#3AF2A1]"
            />
          )}

          {editor.tipo === 'valor' && (
            <input
              autoFocus
              value={valorEdicao}
              inputMode="numeric"
              onChange={(event) => setValorEdicao(formatarCampoMoeda(event.target.value))}
              className="min-h-[52px] w-full rounded-2xl border border-[#1C3D2E] bg-black/45 px-4 py-3 text-center text-xl font-black text-[#F4FFF8] outline-none focus:border-[#3AF2A1]"
            />
          )}

          {editor.tipo === 'categoria' && (
            <>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-[#91A99C]">
                  Categoria
                </span>

                <select
                  value={categoriaEdicaoId}
                  onChange={(event) => setCategoriaEdicaoId(event.target.value)}
                  className="min-h-[48px] w-full rounded-2xl border border-[#1C3D2E] bg-black/45 px-4 py-3 text-sm text-[#F4FFF8] outline-none focus:border-[#3AF2A1]"
                >
                  <option value="">Selecione</option>
                  {categoriasEditor.map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>
                      {categoria.nome}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-[#91A99C]">
                  Subcategoria
                </span>

                <select
                  value={subcategoriaEdicaoId}
                  onChange={(event) => setSubcategoriaEdicaoId(event.target.value)}
                  className="min-h-[48px] w-full rounded-2xl border border-[#1C3D2E] bg-black/45 px-4 py-3 text-sm text-[#F4FFF8] outline-none focus:border-[#3AF2A1]"
                >
                  <option value="">Selecione</option>
                  {subcategoriasEditor.map((subcategoria) => (
                    <option key={subcategoria.id} value={subcategoria.id}>
                      {subcategoria.nome}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {possuiRelacionados && (
            <div className="rounded-3xl border border-[#1C3D2E] bg-black/35 p-2">
              <p className="mb-2 px-2 text-xs font-black text-[#91A99C]">
                Deseja alterar:
              </p>

              <div className="grid gap-2">
                <OpcaoEscopo
                  ativo={escopoEdicao === 'este'}
                  onClick={() => setEscopoEdicao('este')}
                >
                  Somente este lançamento
                </OpcaoEscopo>

                {editor.tipo === 'valor' && (
                  <OpcaoEscopo
                    ativo={escopoEdicao === 'a_partir'}
                    onClick={() => setEscopoEdicao('a_partir')}
                  >
                    A partir deste lançamento
                  </OpcaoEscopo>
                )}

                <OpcaoEscopo
                  ativo={escopoEdicao === 'todos'}
                  onClick={() => setEscopoEdicao('todos')}
                >
                  Todos os lançamentos relacionados
                </OpcaoEscopo>
              </div>
            </div>
          )}

          <button
            onClick={onSalvar}
            className="min-h-[48px] w-full rounded-2xl bg-gradient-to-br from-[#3AF2A1] via-[#0F9D58] to-[#021A10] text-sm font-black text-white shadow-[0_0_24px_rgba(58,242,161,0.22)] active:scale-[0.98]"
          >
            Salvar alteração
          </button>
        </div>
      </div>
    </div>
  )
}

function TituloFiltro({ children }) {
  return (
    <p className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#3AF2A1]">
      {children}
    </p>
  )
}

function FiltroSelect({ titulo, value, onChange, opcoes }) {
  return (
    <div>
      <TituloFiltro>{titulo}</TituloFiltro>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[42px] w-full rounded-2xl border border-[#1C3D2E] bg-[#030504] px-3 text-sm font-semibold text-[#F4FFF8] outline-none"
      >
        {opcoes.map(([valor, label]) => (
          <option key={valor} value={valor}>
            {label}
          </option>
        ))}
      </select>
    </div>
  )
}

function OpcaoEscopo({ ativo, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`
        min-h-[40px] rounded-2xl border px-3 text-left text-xs font-black transition active:scale-[0.98]
        ${
          ativo
            ? 'border-[#3AF2A1]/50 bg-[#3AF2A1]/10 text-[#3AF2A1]'
            : 'border-[#1C3D2E] bg-black/35 text-[#91A99C]'
        }
      `}
    >
      {children}
    </button>
  )
}