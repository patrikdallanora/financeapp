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
import { agendarSync, executarSync } from '../sync/syncManager'
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

const valorBooleano = (valor) => {
  if (valor === true) return true
  if (valor === false) return false

  const texto = String(valor || '').trim().toLowerCase()

  return texto === 'true' || texto === 'sim' || texto === '1'
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

  return hoje >= dataVencimento
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

  const [mesAtual, setMesAtual] = useState(obterMesInicial(filtroInicial))
  const [filtro, setFiltro] = useState(obterFiltroInicial(filtroInicial))
  const [filtroCategoria, setFiltroCategoria] = useState(obterCategoriaInicial(filtroInicial))
  const [filtroTipo, setFiltroTipo] = useState(() => {
  if (typeof filtroInicial === 'object' && filtroInicial?.filtro) {
    if (filtroInicial.filtro === 'receita') return 'receita'
    if (filtroInicial.filtro === 'despesa') return 'despesa'
  }

  return filtrosIniciais.tipo
})
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

  const [modalPagamento, setModalPagamento] = useState(null)
  const [valorPagamentoFatura, setValorPagamentoFatura] = useState('')

  const [editorLancamento, setEditorLancamento] = useState(null)
  const [salvandoEditor, setSalvandoEditor] = useState(false)
  const [escopoEditorLancamento, setEscopoEditorLancamento] = useState('este')

  const [camposEditorLancamento, setCamposEditorLancamento] = useState({
    descricao: '',
    valor: '',
    beneficiario: 'PK',
    dataCompetencia: '',
    status: 'pendente',
    categoriaId: '',
    subcategoriaId: '',
    metodoPagamento: 'pix',
    cartaoId: '',
    faturaRef: '',
    observacoes: ''
  })

  useEffect(() => {
    const novosFiltros = obterFiltrosDetalhadosIniciais(filtroInicial)

    setMesAtual(obterMesInicial(filtroInicial))
    setFiltro(obterFiltroInicial(filtroInicial))
    setFiltroCategoria(obterCategoriaInicial(filtroInicial))
   if (typeof filtroInicial === 'object' && filtroInicial?.filtro) {
  if (filtroInicial.filtro === 'receita') {
    setFiltroTipo('receita')
  } else if (filtroInicial.filtro === 'despesa') {
    setFiltroTipo('despesa')
  } else {
    setFiltroTipo(novosFiltros.tipo)
  }
} else {
  setFiltroTipo(novosFiltros.tipo)
}
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

const cartao = cartoes.find(
  (item) =>
    item.uuid === lancamento.cartaoUuid ||
    item.id === Number(lancamento.cartaoId)
)

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
  if (!subcategorias || !categorias || filtroCategoriaId === 'todos') {
    return []
  }

  const categoriaSelecionada = categorias.find(
    (categoria) => Number(categoria.id) === Number(filtroCategoriaId)
  )

  if (!categoriaSelecionada) return []

  return subcategorias.filter(
    (subcategoria) =>
      subcategoria.categoriaUuid === categoriaSelecionada.uuid ||
      Number(subcategoria.categoriaId) === Number(categoriaSelecionada.id)
  )
}, [subcategorias, categorias, filtroCategoriaId])

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
        return Number(lancamento.categoria?.id) === Number(filtroCategoriaId)
      })
      .filter((lancamento) => {
        if (filtroSubcategoriaId === 'todos') return true
        return Number(lancamento.subcategoria?.id) === Number(filtroSubcategoriaId)
      })
      .filter((lancamento) => {
        if (filtroUsuarioId === 'todos') return true
        return Number(lancamento.usuarioId) === Number(filtroUsuarioId)
      })
      .filter((lancamento) => {
        if (filtroCartaoId === 'todos') return true
        return Number(lancamento.cartao?.id) === Number(filtroCartaoId)
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
      const cartaoChave =
  lancamento.cartao?.uuid ||
  lancamento.cartaoUuid ||
  lancamento.cartao?.id ||
  lancamento.cartaoId ||
  'sem-cartao'

const faturaRef = lancamento.faturaRef || mesAtual
const chave = `${cartaoChave}-${faturaRef}`

      if (!mapa.has(chave)) {
        mapa.set(chave, {
          id: chave,
cartaoId: lancamento.cartao?.id || lancamento.cartaoId || null,
cartaoUuid: lancamento.cartao?.uuid || lancamento.cartaoUuid || null,
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
      const fechadaPorCampo = fatura.itens.some((item) => valorBooleano(item.faturaFechada))
      const fechadaPorValor = valorPago >= fatura.total && fatura.total > 0
      const fechada = fechadaPorCampo || fechadaPorValor

      const dataVencimento = obterDataVencimentoFatura(fatura.cartao, fatura.faturaRef)

      return {
        ...fatura,
        valorPago,
        fechada,
        dataVencimento,
        vencida: faturaEstaVencida(fatura.cartao, fatura.faturaRef, fechada)
      }
    })

    return lista.sort((a, b) => {
      const nomeA = a.cartao?.nome || ''
      const nomeB = b.cartao?.nome || ''

      return nomeA.localeCompare(nomeB)
    })
  }, [lancamentosFiltrados, mesAtual])

  const timelineExtrato = useMemo(() => {
    const itens = []

    for (const fatura of faturasCartao) {
      const dataVencimento =
        fatura.dataVencimento ||
        obterDataVencimentoFatura(fatura.cartao, fatura.faturaRef) ||
        `${fatura.faturaRef || mesAtual}-01`

      itens.push({
        id: `fatura-${fatura.id}`,
        tipo: 'fatura',
        data: dataVencimento,
        fatura
      })
    }

    const itensNaoCartao = lancamentosFiltrados.filter(
      (lancamento) => lancamento.metodoPagamento !== 'cartao'
    )

    for (const lancamento of itensNaoCartao) {
      itens.push({
        id: `lancamento-${lancamento.id}`,
        tipo: 'lancamento',
        data: normalizarDataCivil(lancamento.dataCompetencia) || 'Sem data',
        lancamento
      })
    }

    itens.sort((a, b) => {
      const comparacaoData = String(a.data || '').localeCompare(String(b.data || ''))

      if (comparacaoData !== 0) return comparacaoData

      if (a.tipo === b.tipo) {
        const descricaoA = a.lancamento?.descricao || a.fatura?.cartao?.nome || ''
        const descricaoB = b.lancamento?.descricao || b.fatura?.cartao?.nome || ''

        return descricaoA.localeCompare(descricaoB)
      }

      return a.tipo === 'fatura' ? -1 : 1
    })

    const mapa = new Map()

    for (const item of itens) {
      if (!mapa.has(item.data)) {
        mapa.set(item.data, [])
      }

      mapa.get(item.data).push(item)
    }

    return Array.from(mapa.entries())
  }, [faturasCartao, lancamentosFiltrados, mesAtual])

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

  const itensAtualizados = await db.lancamentos
    .filter((item) => {
      if (item.deletedAt) return false

      const mesmoCartao =
        item.cartaoUuid === modalPagamento.cartaoUuid ||
        Number(item.cartaoId) === Number(modalPagamento.cartaoId)

      return mesmoCartao && item.faturaRef === modalPagamento.faturaRef
    })
    .toArray()

  const itensDaFatura = itensAtualizados.length > 0 ? itensAtualizados : modalPagamento.itens

  const totalFatura = itensDaFatura.reduce(
    (total, item) => total + Number(item.valor || 0),
    0
  )

  const valorPagoAnterior = Math.max(
    ...itensDaFatura.map((item) => Number(item.faturaValorPago || 0)),
    0
  )

  const totalCentavos = Math.round(totalFatura * 100)
  const valorPagoAnteriorCentavos = Math.round(valorPagoAnterior * 100)
  const valorInformadoCentavos = Math.round(valorInformado * 100)

  const novoValorPagoCentavos = Math.min(
    valorPagoAnteriorCentavos + valorInformadoCentavos,
    totalCentavos
  )

  const novoValorPago = novoValorPagoCentavos / 100
  const faturaFechada = novoValorPagoCentavos >= totalCentavos
  const agora = agoraISO()
  const dataPagamento = new Date().toISOString().slice(0, 10)

  await Promise.all(
    itensDaFatura.map((item) =>
      db.lancamentos.update(item.id, {
        faturaValorPago: novoValorPago,
        faturaFechada,
        status: faturaFechada ? 'pago' : 'pendente',
        dataPagamento: faturaFechada ? dataPagamento : null,
        updatedAt: agora,
        syncStatus: 'pending'
      })
    )
  )

  agendarSync()
  await executarSync()

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

  const abrirEditorLancamento = (lancamento) => {
    setEditorLancamento(lancamento)
    setEscopoEditorLancamento('este')

    setCamposEditorLancamento({
      descricao: lancamento.descricao || '',
      valor: formatarCampoMoeda(String(Math.round(Number(lancamento.valor || 0) * 100))),
      beneficiario: lancamento.beneficiario || 'PK',
      dataCompetencia: normalizarDataCivil(lancamento.dataCompetencia) || '',
      status: lancamento.status || 'pendente',
      categoriaId: String(lancamento.categoriaId || ''),
      subcategoriaId: String(lancamento.subcategoriaId || ''),
      metodoPagamento: lancamento.metodoPagamento || 'pix',
      cartaoId: String(lancamento.cartaoId || ''),
      faturaRef: lancamento.faturaRef || '',
      observacoes: lancamento.observacoes || ''
    })
  }

  const salvarEditorLancamento = async () => {
    if (!editorLancamento) return
    if (salvandoEditor) return

    setSalvandoEditor(true)

    try {
    const descricaoFinal = camposEditorLancamento.descricao.trim()
    const valorFinal = moedaParaNumero(camposEditorLancamento.valor)

    if (!descricaoFinal) {
      alert('Informe a descrição.')
      return
    }

    if (!valorFinal || valorFinal <= 0) {
      alert('Informe um valor válido.')
      return
    }

    if (!camposEditorLancamento.dataCompetencia) {
      alert('Informe a competência.')
      return
    }

    if (!camposEditorLancamento.categoriaId) {
      alert('Selecione uma categoria.')
      return
    }

    if (!camposEditorLancamento.subcategoriaId) {
      alert('Selecione uma subcategoria.')
      return
    }

    if (
      camposEditorLancamento.metodoPagamento === 'cartao' &&
      (!camposEditorLancamento.cartaoId || !camposEditorLancamento.faturaRef)
    ) {
      alert('Selecione o cartão e a fatura.')
      return
    }

    const relacionados = obterRelacionados(
      editorLancamento,
      escopoEditorLancamento
    )

    const agora = agoraISO()

    const categoria = categorias.find(
      (item) => Number(item.id) === Number(camposEditorLancamento.categoriaId)
    )

    const subcategoria = subcategorias.find(
      (item) => Number(item.id) === Number(camposEditorLancamento.subcategoriaId)
    )

    const cartao = cartoes.find(
      (item) => Number(item.id) === Number(camposEditorLancamento.cartaoId)
    )

    const metodoPagamentoFinal = camposEditorLancamento.metodoPagamento
    const statusFinal = camposEditorLancamento.status

    const alteracoes = {
      descricao: descricaoFinal,
      valor: valorFinal,
      beneficiario: camposEditorLancamento.beneficiario || 'PK',
      dataCompetencia: camposEditorLancamento.dataCompetencia,
      status: statusFinal,
      dataPagamento: statusFinal === 'pago' ? new Date().toISOString().slice(0, 10) : null,

      categoriaId: Number(camposEditorLancamento.categoriaId),
      categoriaUuid: categoria?.uuid || null,

      subcategoriaId: Number(camposEditorLancamento.subcategoriaId),
      subcategoriaUuid: subcategoria?.uuid || null,

      metodoPagamento: metodoPagamentoFinal,

      cartaoId:
        metodoPagamentoFinal === 'cartao'
          ? Number(camposEditorLancamento.cartaoId)
          : null,

      cartaoUuid:
        metodoPagamentoFinal === 'cartao'
          ? cartao?.uuid || null
          : null,

      faturaRef:
        metodoPagamentoFinal === 'cartao'
          ? camposEditorLancamento.faturaRef
          : null,

      observacoes: camposEditorLancamento.observacoes.trim(),

      updatedAt: agora,
      syncStatus: 'pending'
    }

    if (metodoPagamentoFinal !== 'cartao') {
      alteracoes.faturaValorPago = 0
      alteracoes.faturaFechada = false
    }

    for (const lancamento of relacionados) {
      await db.lancamentos.update(lancamento.id, alteracoes)
    }

    setEditorLancamento(null)

    agendarSync()
    } finally {
  setSalvandoEditor(false)
}
  }

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
        {timelineExtrato.map(([data, itens]) => (
          <div key={data} className="space-y-1.5">
            <div className="flex items-end justify-between px-2">
              <p className="text-xl font-black leading-6 tracking-tight text-[#F4FFF8]">
                {formatarDataGrupo(data)}
              </p>

              <p className="text-sm font-semibold text-[#3AF2A1]">
                {itens.length} {itens.length === 1 ? 'item' : 'itens'}
              </p>
            </div>

            <div className="space-y-3">
              {itens.map((item) => {
                if (item.tipo === 'fatura') {
                  const fatura = item.fatura

                  return (
                    <CardFatura
                      key={item.id}
                      fatura={fatura}
                      expandida={faturaExpandidaId === fatura.id}
                      onAlternarPagamento={() => abrirPagamentoFatura(fatura)}
                      onAlternarExpansao={() =>
                        setFaturaExpandidaId((atual) => (atual === fatura.id ? null : fatura.id))
                      }
                      onEditarLancamento={abrirEditorLancamento}
                      expandidoId={expandidoId}
                      setExpandidoId={setExpandidoId}
                    />
                  )
                }

                return (
                  <CardExtrato
                    key={item.id}
                    lancamento={item.lancamento}
                    expandido={expandidoId === item.lancamento.id}
                    onToggle={() =>
                      setExpandidoId((atual) => (atual === item.lancamento.id ? null : item.lancamento.id))
                    }
                    onEditarLancamento={abrirEditorLancamento}
                  />
                )
              })}
            </div>
          </div>
        ))}

        {timelineExtrato.length === 0 && (
          <CardPremium>
            <p className="text-sm font-semibold text-[#91A99C]">
              Nenhum lançamento encontrado para os filtros selecionados.
            </p>
          </CardPremium>
        )}
      </section>

        {editorLancamento && (
          <ModalEditorLancamento
            lancamento={editorLancamento}
            campos={camposEditorLancamento}
            setCampos={setCamposEditorLancamento}
            escopo={escopoEditorLancamento}
            setEscopo={setEscopoEditorLancamento}
            categorias={categorias}
            subcategorias={subcategorias}
            cartoes={cartoes}
            onFechar={() => setEditorLancamento(null)}
            onSalvar={salvarEditorLancamento}
            salvandoEditor={salvandoEditor}
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
  onEditarLancamento,
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
          {fatura.fechada ? (
  <CheckCircle2 size={18} />
) : fatura.vencida ? (
  <XCircle size={18} />
) : (
  <CreditCard size={18} />
)}
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
                onEditarLancamento={onEditarLancamento}
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
  onEditarLancamento
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
          
        />
      ))}
    </div>
  )
}

function CardExtrato({
  lancamento,
  expandido,
  onToggle,
  onEditarLancamento,
  controlePorFatura = false
}) {
  const positivo = lancamento.tipo === 'receita'

  const hoje = new Date().toISOString().slice(0, 10)
const dataCompetencia = normalizarDataCivil(lancamento.dataCompetencia)
const lancamentoPago = lancamento.status === 'pago'
const lancamentoVencidoOuHoje = !lancamentoPago && dataCompetencia && dataCompetencia <= hoje

const classeIconeLancamento = lancamentoPago
  ? 'border-[#3AF2A1]/40 bg-[#3AF2A1]/10 text-[#3AF2A1]'
  : lancamentoVencidoOuHoje
    ? 'border-red-900/60 bg-red-950/30 text-red-300'
    : ''

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
    if (lancamento.parcelamentoId) {
      const excluirTodos = confirm(
        `Este lançamento faz parte de uma compra parcelada. Deseja excluir todas as parcelas de "${lancamento.descricao}"?`
      )

      if (excluirTodos) {
        const relacionados = await db.lancamentos
          .where('parcelamentoId')
          .equals(lancamento.parcelamentoId)
          .toArray()

        for (const item of relacionados) {
          if (!item.deletedAt) {
            await softDelete('lancamentos', item.id)
          }
        }

        agendarSync()
        return
      }
    }

    const confirmar = confirm(`Excluir apenas este lançamento "${lancamento.descricao}"?`)

    if (!confirmar) return

    await softDelete('lancamentos', lancamento.id)
    agendarSync()
  }

  return (
    <CardPremium className="overflow-hidden rounded-[20px] border-[#1C3D2E] bg-[#03130C]/90 p-0 shadow-[0_0_22px_rgba(58,242,161,0.06)]">
      <button
        onClick={() => onEditarLancamento(lancamento)}
        className="grid min-h-[44px] w-full grid-cols-[54px_minmax(0,1fr)_18px] items-center gap-2 px-3 py-0.5 text-left active:scale-[0.995]"
      >
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-2xl border ${classeIconeLancamento}`}>
  {lancamentoPago ? (
    <CheckCircle2 size={18} />
  ) : lancamentoVencidoOuHoje ? (
    <XCircle size={18} />
  ) : (
    <div className="origin-center scale-[0.90]">
      <IconeCategoria
        icone={lancamento.categoria?.icone}
        cor={lancamento.categoria?.cor}
        tamanho="sm"
      />
    </div>
  )}
</div>

        <div className="min-w-0">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onEditarLancamento(lancamento)
            }}
            className="block w-full text-left text-[12.5px] font-black leading-[16px] text-[#F4FFF8] overflow-hidden"
style={{
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical'
}}
          >
            {lancamento.descricao}
            {lancamento.parcelaAtual && lancamento.totalParcelas
              ? ` ${lancamento.parcelaAtual}/${lancamento.totalParcelas}`
              : ''}
            {lancamento.recorrente ? ' · Fixa mensal' : ''}
          </button>

          <div className="mt-[1px] flex min-w-0 items-center justify-between gap-3">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onEditarLancamento(lancamento)
              }}
              className="min-w-0 truncate text-left text-[10.5px] font-semibold leading-[13px] text-[#B5CFC1]"
            >
              {lancamento.categoria?.nome || 'Sem categoria'}
              {lancamento.subcategoria?.nome ? ` • ${lancamento.subcategoria.nome}` : ''}
            </button>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onEditarLancamento(lancamento)
              }}
              className="shrink-0 text-right"
            >
              <span className={`whitespace-nowrap text-[12px] font-black leading-[14px] ${positivo ? 'text-[#3AF2A1]' : 'text-red-300'}`}>
                {positivo ? '+' : '-'} {formatarMoeda(lancamento.valor)}
              </span>
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onToggle()
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[#B5CFC1] active:scale-95"
        >
          <ChevronDown
            size={14}
            className={`transition ${expandido ? 'rotate-180' : ''}`}
          />
        </button>
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
      <div className="max-h-[90vh] w-full max-w-[430px] overflow-y-auto rounded-[30px] border border-[#1C3D2E] bg-[#03130C] p-4 shadow-2xl">
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

const calcularFaturaEditor = (dataCompetencia, cartao) => {
  if (!dataCompetencia || !cartao) return ''

  const [ano, mes, dia] = dataCompetencia.split('-').map(Number)
  const dataBase = new Date(ano, mes - 1, 1)

  if (dia > Number(cartao.diaFechamento || 31)) {
    dataBase.setMonth(dataBase.getMonth() + 1)
  }

  return dataBase.toISOString().slice(0, 7)
}

function ModalEditorLancamento({
  lancamento,
  campos,
  setCampos,
  escopo,
  setEscopo,
  categorias,
  subcategorias,
  cartoes,
  onFechar,
  onSalvar,
  salvandoEditor
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 px-4 pb-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-[430px] flex-col overflow-hidden rounded-[30px] border border-[#1C3D2E] bg-[#03130C] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#1C3D2E] px-4 py-4">
          
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#3AF2A1]">
              Editar lançamento
            </p>

            <h2 className="mt-1 text-xl font-black text-[#F4FFF8]">
              {lancamento.descricao}
            </h2>
          </div>

          <button
            onClick={onFechar}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#1C3D2E] bg-black/40 text-[#91A99C]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">

        <div className="space-y-3">

            {(lancamento.parcelamentoId || lancamento.recorrenciaId) && (
              <div className="rounded-3xl border border-[#1C3D2E] bg-black/35 p-2">
                <p className="mb-2 px-2 text-xs font-black text-[#91A99C]">
                  Alterar:
                </p>

                <div className="grid gap-2">
                  <OpcaoEscopo
                    ativo={escopo === 'este'}
                    onClick={() => setEscopo('este')}
                  >
                    Somente este lançamento
                  </OpcaoEscopo>

                  <OpcaoEscopo
                    ativo={escopo === 'a_partir'}
                    onClick={() => setEscopo('a_partir')}
                  >
                    A partir deste lançamento
                  </OpcaoEscopo>

                  <OpcaoEscopo
                    ativo={escopo === 'todos'}
                    onClick={() => setEscopo('todos')}
                  >
                    Todos relacionados
                  </OpcaoEscopo>
                </div>
              </div>
            )}
            
            <CampoEditor titulo="Descrição">
              <input
                value={campos.descricao}
                onChange={(event) =>
                  setCampos((atual) => ({ ...atual, descricao: event.target.value }))
                }
                className="min-h-[48px] w-full rounded-2xl border border-[#1C3D2E] bg-black/45 px-4 py-3 text-sm font-semibold text-[#F4FFF8] outline-none focus:border-[#3AF2A1]"
              />
            </CampoEditor>

            <CampoEditor titulo="Valor">
              <input
                value={campos.valor}
                inputMode="numeric"
                onChange={(event) =>
                  setCampos((atual) => ({
                    ...atual,
                    valor: formatarCampoMoeda(event.target.value)
                  }))
                }
                className="min-h-[52px] w-full rounded-2xl border border-[#1C3D2E] bg-black/45 px-4 py-3 text-center text-xl font-black text-[#F4FFF8] outline-none focus:border-[#3AF2A1]"
              />
            </CampoEditor>

            <CampoEditor titulo="Beneficiário">
              <select
                value={campos.beneficiario}
                onChange={(event) =>
                  setCampos((atual) => ({ ...atual, beneficiario: event.target.value }))
                }
                className="min-h-[48px] w-full rounded-2xl border border-[#1C3D2E] bg-[#030504] px-4 py-3 text-sm font-semibold text-[#F4FFF8] outline-none"
              >
                <option value="PK">PK</option>
                <option value="Grazi">Grazi</option>
                <option value="Casal">Casal</option>
              </select>
            </CampoEditor>

            <CampoEditor titulo="Competência">
              <input
                type="date"
                value={campos.dataCompetencia}
                onChange={(event) => {
                  const novaData = event.target.value

                  setCampos((atual) => {
                    const cartaoSelecionado = cartoes.find(
                      (cartao) => Number(cartao.id) === Number(atual.cartaoId)
                    )

                    return {
                      ...atual,
                      dataCompetencia: novaData,
                      faturaRef:
                        atual.metodoPagamento === 'cartao'
                          ? calcularFaturaEditor(novaData, cartaoSelecionado)
                          : atual.faturaRef
                    }
                  })
                }}
                className="min-h-[48px] w-full rounded-2xl border border-[#1C3D2E] bg-black/45 px-4 py-3 text-sm font-semibold text-[#F4FFF8] outline-none focus:border-[#3AF2A1]"
              />
            </CampoEditor>

            <CampoEditor titulo="Status">
              <select
                value={campos.status}
                onChange={(event) =>
                  setCampos((atual) => ({ ...atual, status: event.target.value }))
                }
                className="min-h-[48px] w-full rounded-2xl border border-[#1C3D2E] bg-[#030504] px-4 py-3 text-sm font-semibold text-[#F4FFF8] outline-none"
              >
                <option value="pendente">Pendente</option>
                <option value="pago">Pago</option>
              </select>
            </CampoEditor>

            <CampoEditor titulo="Categoria">
              <select
                value={campos.categoriaId}
                onChange={(event) =>
                  setCampos((atual) => ({
                    ...atual,
                    categoriaId: event.target.value,
                    subcategoriaId: ''
                  }))
                }
                className="min-h-[48px] w-full rounded-2xl border border-[#1C3D2E] bg-[#030504] px-4 py-3 text-sm font-semibold text-[#F4FFF8] outline-none"
              >
                <option value="">Selecione</option>
                {categorias.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.nome}
                  </option>
                ))}
              </select>
            </CampoEditor>

            <CampoEditor titulo="Subcategoria">
              <select
                value={campos.subcategoriaId}
                disabled={!campos.categoriaId}
                onChange={(event) =>
                  setCampos((atual) => ({ ...atual, subcategoriaId: event.target.value }))
                }
                className="min-h-[48px] w-full rounded-2xl border border-[#1C3D2E] bg-[#030504] px-4 py-3 text-sm font-semibold text-[#F4FFF8] outline-none disabled:opacity-50"
              >
                <option value="">
                  {campos.categoriaId ? 'Selecione' : 'Escolha uma categoria primeiro'}
                </option>

                {subcategorias
                  .filter((subcategoria) => {
                    const categoriaSelecionada = categorias.find(
                      (categoria) => Number(categoria.id) === Number(campos.categoriaId)
                    )

                    if (!categoriaSelecionada) return false

                    return (
                      subcategoria.categoriaUuid === categoriaSelecionada.uuid ||
                      Number(subcategoria.categoriaId) === Number(categoriaSelecionada.id)
                    )
                  })
                  .map((subcategoria) => (
                    <option key={subcategoria.id} value={subcategoria.id}>
                      {subcategoria.nome}
                    </option>
                  ))}
              </select>
            </CampoEditor>

            <CampoEditor titulo="Forma de pagamento">
              <select
                value={campos.metodoPagamento}
                onChange={(event) => {
                  const novoMetodo = event.target.value

                  setCampos((atual) => {
                    const cartaoSelecionado = cartoes.find(
                      (cartao) => Number(cartao.id) === Number(atual.cartaoId)
                    )

                    return {
                      ...atual,
                      metodoPagamento: novoMetodo,
                      cartaoId: novoMetodo === 'cartao' ? atual.cartaoId : '',
                      faturaRef:
                        novoMetodo === 'cartao'
                          ? calcularFaturaEditor(atual.dataCompetencia, cartaoSelecionado)
                          : ''
                    }
                  })
                }}
                className="min-h-[48px] w-full rounded-2xl border border-[#1C3D2E] bg-[#030504] px-4 py-3 text-sm font-semibold text-[#F4FFF8] outline-none"
              >
                <option value="pix">PIX</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="cartao">Cartão</option>
              </select>
            </CampoEditor>

            {campos.metodoPagamento === 'cartao' && (
              <>
                <CampoEditor titulo="Cartão">
                  <select
                    value={campos.cartaoId}
                    onChange={(event) => {
                      const novoCartaoId = event.target.value

                      setCampos((atual) => {
                        const cartaoSelecionado = cartoes.find(
                          (cartao) => Number(cartao.id) === Number(novoCartaoId)
                        )

                        return {
                          ...atual,
                          cartaoId: novoCartaoId,
                          faturaRef: calcularFaturaEditor(atual.dataCompetencia, cartaoSelecionado)
                        }
                      })
                    }}
                    className="min-h-[48px] w-full rounded-2xl border border-[#1C3D2E] bg-[#030504] px-4 py-3 text-sm font-semibold text-[#F4FFF8] outline-none"
                  >
                    <option value="">Selecione</option>
                    {cartoes.map((cartao) => (
                      <option key={cartao.id} value={cartao.id}>
                        {cartao.nome}
                      </option>
                    ))}
                  </select>
                </CampoEditor>

                <CampoEditor titulo="Fatura">
                  <input
                    type="month"
                    value={campos.faturaRef}
                    onChange={(event) =>
                      setCampos((atual) => ({ ...atual, faturaRef: event.target.value }))
                    }
                    className="min-h-[48px] w-full rounded-2xl border border-[#1C3D2E] bg-black/45 px-4 py-3 text-sm font-semibold text-[#F4FFF8] outline-none focus:border-[#3AF2A1]"
                  />
                </CampoEditor>
              </>
            )}

            <CampoEditor titulo="Observações">
              <textarea
                value={campos.observacoes}
                onChange={(event) =>
                  setCampos((atual) => ({ ...atual, observacoes: event.target.value }))
                }
                placeholder="Informações adicionais"
                className="min-h-[86px] w-full resize-none rounded-2xl border border-[#1C3D2E] bg-black/45 px-4 py-3 text-sm font-semibold text-[#F4FFF8] outline-none placeholder:text-[#587367] focus:border-[#3AF2A1]"
              />
            </CampoEditor>
        </div>
        </div>
        <div className="border-t border-[#1C3D2E] bg-[#03130C] p-4">
            <button
              onClick={onSalvar}
              disabled={salvandoEditor}
              className="min-h-[48px] w-full rounded-2xl bg-gradient-to-br from-[#3AF2A1] via-[#0F9D58] to-[#021A10] text-sm font-black text-white shadow-[0_0_24px_rgba(58,242,161,0.22)] active:scale-[0.98]"
            >
              {salvandoEditor ? 'Salvando...' : 'Salvar alterações'}
            </button>
        </div>
      </div>
    </div>
  )
}

function CampoEditor({ titulo, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-[#91A99C]">
        {titulo}
      </span>

      {children}
    </label>
  )
}

const obterMesInicial = (filtroInicial) => {
  if (typeof filtroInicial === 'object' && filtroInicial?.mesReferencia) {
    return filtroInicial.mesReferencia
  }

  return new Date().toISOString().slice(0, 7)
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