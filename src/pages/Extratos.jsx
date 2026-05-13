import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Search,
  Trash2,
  XCircle
} from 'lucide-react'

import { db, agoraISO, softDelete } from '../db/database'
import { agendarSync } from '../sync/syncManager'
import { CardPremium } from '../components/CardPremium'
import { FiltroSegmentado } from '../components/FiltroSegmentado'
import { TopoTela } from '../components/TopoTela'
import { IconeCategoria } from '../components/IconeCategoria'

const formatarMoeda = (valor) => {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
}

const normalizarTexto = (texto) => {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

const formatarMes = (mesRef) => {
  const [ano, mes] = mesRef.split('-').map(Number)
  const data = new Date(ano, mes - 1, 1)

  const nomeMes = data.toLocaleDateString('pt-BR', {
    month: 'long'
  })

  return `${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}/${String(ano).slice(-2)}`
}

const alterarMes = (mesRef, deslocamento) => {
  const [ano, mes] = mesRef.split('-').map(Number)
  const data = new Date(ano, mes - 1 + deslocamento, 1)
  return data.toISOString().slice(0, 7)
}

const formatarDataGrupo = (dataISO) => {
  const hoje = new Date().toISOString().slice(0, 10)

  const ontemData = new Date()
  ontemData.setDate(ontemData.getDate() - 1)
  const ontem = ontemData.toISOString().slice(0, 10)

  if (dataISO === hoje) return 'Hoje'
  if (dataISO === ontem) return 'Ontem'

  const [ano, mes, dia] = dataISO.split('-')
  return `${dia}/${mes}/${ano}`
}

export default function Extratos({ filtroInicial = 'todos', onVoltar }) {
  const [mesAtual, setMesAtual] = useState(new Date().toISOString().slice(0, 7))
  const [filtro, setFiltro] = useState(filtroInicial || 'todos')
  const [busca, setBusca] = useState('')
  const [expandidoId, setExpandidoId] = useState(null)

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

  const dadosEnriquecidos = useMemo(() => {
    if (!lancamentos || !categorias || !subcategorias || !cartoes) return []

    return lancamentos.map((lancamento) => {
      const categoria = categorias.find((item) => item.id === Number(lancamento.categoriaId))
      const subcategoria = subcategorias.find((item) => item.id === Number(lancamento.subcategoriaId))
      const cartao = cartoes.find((item) => item.id === Number(lancamento.cartaoId))

      return {
        ...lancamento,
        categoria,
        subcategoria,
        cartao
      }
    })
  }, [lancamentos, categorias, subcategorias, cartoes])

  const lancamentosFiltrados = useMemo(() => {
    const termo = normalizarTexto(busca)

    return dadosEnriquecidos
      .filter((lancamento) => lancamento.dataCompetencia?.startsWith(mesAtual))
      .filter((lancamento) => {
        if (filtro === 'todos') return true
        if (filtro === 'receita') return lancamento.tipo === 'receita'
        if (filtro === 'despesa') return lancamento.tipo === 'despesa'
        if (filtro === 'pendente') return lancamento.status === 'pendente'
        if (filtro === 'pago') return lancamento.status === 'pago'
        if (filtro === 'pix') return lancamento.metodoPagamento === 'pix'
        if (filtro === 'dinheiro') return lancamento.metodoPagamento === 'dinheiro'
        if (filtro === 'cartao') return lancamento.metodoPagamento === 'cartao'
        return true
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
        const dataA = new Date(a.dataCompetencia || 0).getTime()
        const dataB = new Date(b.dataCompetencia || 0).getTime()
        return dataB - dataA
      })
  }, [dadosEnriquecidos, mesAtual, filtro, busca])

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
      saldo: receitas - despesas,
      total: lancamentosFiltrados.length
    }
  }, [lancamentosFiltrados])

  const grupos = useMemo(() => {
    const mapa = new Map()

    for (const lancamento of lancamentosFiltrados) {
      const data = lancamento.dataCompetencia || 'Sem data'

      if (!mapa.has(data)) {
        mapa.set(data, [])
      }

      mapa.get(data).push(lancamento)
    }

    return Array.from(mapa.entries())
  }, [lancamentosFiltrados])

  if (!lancamentos || !categorias || !subcategorias || !cartoes) {
    return (
      <div className="space-y-4 pb-24">
        <TopoTela titulo="Extratos" subtitulo="Carregando histórico financeiro..." />
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-24">
      <button
        onClick={onVoltar}
        className="flex items-center gap-2 text-sm font-black text-[#91A99C]"
      >
        <ArrowLeft size={18} />
        Voltar
      </button>

      <TopoTela
        titulo="Extratos"
        subtitulo="Histórico financeiro filtrado e organizado por dia."
      />

      <CardPremium className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setMesAtual((atual) => alterarMes(atual, -1))}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#1C2A24] bg-[#030504] text-[#91A99C]"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="text-center">
            <p className="text-xs font-semibold text-[#91A99C]">Período</p>
            <p className="text-lg font-black text-[#F4FFF8]">{formatarMes(mesAtual)}</p>
          </div>

          <button
            onClick={() => setMesAtual((atual) => alterarMes(atual, 1))}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#1C2A24] bg-[#030504] text-[#91A99C]"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <MiniResumo titulo="Receitas" valor={resumo.receitas} positivo />
          <MiniResumo titulo="Despesas" valor={resumo.despesas} />
          <MiniResumo titulo="Saldo" valor={resumo.saldo} positivo={resumo.saldo >= 0} />
        </div>

        <div className="relative">
          <Search
            size={17}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-[#587367]"
          />

          <input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar lançamento"
            className="min-h-[48px] w-full rounded-2xl border border-[#1C2A24] bg-[#030504] py-3 pl-11 pr-4 text-sm text-[#F4FFF8] outline-none placeholder:text-[#587367] focus:border-[#3AF2A1] focus:ring-2 focus:ring-[#3AF2A1]/10"
          />
        </div>

        <FiltroSegmentado
          valor={filtro}
          onChange={setFiltro}
          opcoes={[
            { valor: 'todos', label: 'Todos' },
            { valor: 'receita', label: 'Receitas' },
            { valor: 'despesa', label: 'Despesas' },
            { valor: 'pendente', label: 'Pendentes' },
            { valor: 'pago', label: 'Pagos' },
            { valor: 'pix', label: 'PIX' },
            { valor: 'dinheiro', label: 'Dinheiro' },
            { valor: 'cartao', label: 'Cartão' }
          ]}
        />
      </CardPremium>

      <section className="space-y-5">
        {grupos.map(([data, itens]) => (
          <div key={data} className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#91A99C]">
                {formatarDataGrupo(data)}
              </p>

              <p className="text-xs font-semibold text-[#587367]">
                {itens.length} {itens.length === 1 ? 'item' : 'itens'}
              </p>
            </div>

            <div className="space-y-2">
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
          </div>
        ))}

        {grupos.length === 0 && (
          <CardPremium>
            <p className="text-sm font-semibold text-[#91A99C]">
              Nenhum lançamento encontrado para os filtros selecionados.
            </p>
          </CardPremium>
        )}
      </section>
    </div>
  )
}

function MiniResumo({ titulo, valor, positivo = false }) {
  return (
    <div className="rounded-2xl border border-[#1C2A24] bg-[#030504]/70 p-3">
      <p className="text-[11px] font-semibold text-[#91A99C]">{titulo}</p>
      <p className={`mt-1 truncate text-xs font-black ${positivo ? 'text-[#3AF2A1]' : 'text-red-300'}`}>
        {formatarMoeda(valor)}
      </p>
    </div>
  )
}

function CardExtrato({ lancamento, expandido, onToggle }) {
  const positivo = lancamento.tipo === 'receita'

  const alternarStatus = async () => {
    const novoStatus = lancamento.status === 'pago' ? 'pendente' : 'pago'

    await db.lancamentos.update(lancamento.id, {
      status: novoStatus,
      dataPagamento: novoStatus === 'pago' ? lancamento.dataCompetencia : null,
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
    <CardPremium className="overflow-hidden p-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-4 text-left active:scale-[0.99]"
      >
        <IconeCategoria
          icone={lancamento.categoria?.icone}
          cor={lancamento.categoria?.cor}
          tamanho="sm"
          ativo
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-[#F4FFF8]">
            {lancamento.descricao}
            {lancamento.parcelaAtual && lancamento.totalParcelas
              ? ` · ${lancamento.parcelaAtual}/${lancamento.totalParcelas}`
              : ''}
            {lancamento.recorrente ? ' · Fixa mensal' : ''}
          </p>

          <p className="mt-1 truncate text-xs text-[#91A99C]">
            {lancamento.categoria?.nome || 'Sem categoria'}
            {lancamento.subcategoria?.nome ? ` · ${lancamento.subcategoria.nome}` : ''}
          </p>

          <p className="mt-1 truncate text-[11px] text-[#587367]">
            {lancamento.metodoPagamento}
            {lancamento.cartao ? ` · ${lancamento.cartao.nome}` : ''}
            {lancamento.faturaRef ? ` · ${lancamento.faturaRef}` : ''}
          </p>
        </div>

        <div className="text-right">
          <p className={`text-sm font-black ${positivo ? 'text-[#3AF2A1]' : 'text-red-300'}`}>
            {positivo ? '+' : '-'} {formatarMoeda(lancamento.valor)}
          </p>

          <p className="mt-1 text-[11px] font-semibold capitalize text-[#91A99C]">
            {lancamento.status}
          </p>
        </div>

        <ChevronDown
          size={18}
          className={`shrink-0 text-[#91A99C] transition ${expandido ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        className={`grid transition-all duration-300 ease-out ${
          expandido ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 border-t border-[#1C2A24] p-4 pt-3">
            {lancamento.observacoes && (
              <p className="rounded-2xl border border-[#1C2A24] bg-[#030504]/70 p-3 text-xs leading-5 text-[#91A99C]">
                {lancamento.observacoes}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={alternarStatus}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-[#1C2A24] bg-[#030504] text-xs font-black text-[#3AF2A1] active:scale-[0.98]"
              >
                {lancamento.status === 'pago' ? <XCircle size={15} /> : <CheckCircle2 size={15} />}
                {lancamento.status === 'pago' ? 'Marcar pendente' : 'Marcar pago'}
              </button>

              <button
                onClick={excluir}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-red-900/60 bg-red-950/30 text-xs font-black text-red-300 active:scale-[0.98]"
              >
                <Trash2 size={15} />
                Excluir
              </button>
            </div>
          </div>
        </div>
      </div>
    </CardPremium>
  )
}