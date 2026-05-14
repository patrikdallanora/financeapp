import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
  const nomeMes = data.toLocaleDateString('pt-BR', { month: 'long' })

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
  return `${dia}/${mes}`
}

const formatarMetodo = (metodo) => {
  const mapa = {
    pix: 'pix',
    dinheiro: 'dinheiro',
    cartao: 'cartão'
  }

  return mapa[metodo] || metodo || ''
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
  const [mesAtual, setMesAtual] = useState(new Date().toISOString().slice(0, 7))
  const [filtro, setFiltro] = useState(filtroInicial || 'todos')
  const [busca, setBusca] = useState('')
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
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
      saldo: receitas - despesas
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
            Histórico organizado por dia
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
            ativo={filtro !== 'todos'}
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
          <div className="rounded-3xl border border-[#1C3D2E] bg-black/45 p-2">
            <div className="grid grid-cols-2 gap-2">
              {OPCOES_FILTRO.map((opcao) => {
                const ativo = filtro === opcao.valor

                return (
                  <button
                    key={opcao.valor}
                    onClick={() => {
                      setFiltro(opcao.valor)
                      setFiltrosAbertos(false)
                    }}
                    className={`
                      min-h-[38px] rounded-2xl border px-3 text-left text-xs font-black transition active:scale-[0.98]
                      ${
                        ativo
                          ? 'border-[#3AF2A1]/50 bg-[#3AF2A1]/10 text-[#3AF2A1]'
                          : 'border-[#1C3D2E] bg-[#030504] text-[#91A99C]'
                      }
                    `}
                  >
                    {opcao.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-[#1C3D2E] bg-black/40">
          <ResumoTopo titulo="Receitas" valor={resumo.receitas} positivo />
          <ResumoTopo titulo="Despesas" valor={resumo.despesas} />
          <ResumoTopo titulo="Saldo" valor={resumo.saldo} positivo={resumo.saldo >= 0} semBorda />
        </div>
      </CardPremium>

      <section className="space-y-4">
        {grupos.map(([data, itens]) => (
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
            />
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

function GrupoExtratos({ itens, expandidoId, setExpandidoId }) {
  return (
    <CardPremium className="overflow-hidden rounded-[22px] border-[#1C3D2E] bg-[#03130C]/90 p-0 shadow-[0_0_28px_rgba(58,242,161,0.07)]">
      {itens.map((lancamento, index) => (
        <CardExtrato
          key={lancamento.id}
          lancamento={lancamento}
          ultimo={index === itens.length - 1}
          expandido={expandidoId === lancamento.id}
          onToggle={() =>
            setExpandidoId((atual) => (atual === lancamento.id ? null : lancamento.id))
          }
        />
      ))}
    </CardPremium>
  )
}

function CardExtrato({ lancamento, expandido, onToggle, ultimo }) {
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
    <div className={ultimo ? '' : 'border-b border-[#1C3D2E]/80'}>
      <button
        onClick={onToggle}
        className="grid w-full grid-cols-[42px_1fr_auto_18px] items-center gap-2.5 px-3 py-2 text-left active:scale-[0.995]"
      >
        <IconeCategoria
          icone={lancamento.categoria?.icone}
          cor={lancamento.categoria?.cor}
          tamanho="xs"
          ativo
        />

        <div className="min-w-0">
          <p className="truncate text-[13px] font-black leading-[15px] text-[#F4FFF8]">
            {lancamento.descricao}
            {lancamento.parcelaAtual && lancamento.totalParcelas
              ? ` · ${lancamento.parcelaAtual}/${lancamento.totalParcelas}`
              : ''}
            {lancamento.recorrente ? ' · Fixa mensal' : ''}
          </p>

          <p className="mt-0.5 truncate text-[11px] leading-[13px] text-[#B5CFC1]">
            {lancamento.categoria?.nome || 'Sem categoria'}
            {lancamento.subcategoria?.nome ? ` • ${lancamento.subcategoria.nome}` : ''}
          </p>

          <p className="mt-0.5 truncate text-[10px] leading-[12px] text-[#91A99C]">
            {formatarMetodo(lancamento.metodoPagamento)}
            {lancamento.cartao ? ` • ${lancamento.cartao.nome}` : ''}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className={`text-[13px] font-black leading-[15px] ${positivo ? 'text-[#3AF2A1]' : 'text-red-300'}`}>
            {positivo ? '+' : '-'} {formatarMoeda(lancamento.valor)}
          </p>

          <p className={`mt-0.5 text-[10px] font-semibold capitalize leading-[12px] ${
            lancamento.status === 'pendente' ? 'text-yellow-400' : 'text-[#B5CFC1]'
          }`}
          >
            {lancamento.status}
          </p>
        </div>

        <ChevronDown
          size={15}
          className={`shrink-0 text-[#B5CFC1] transition ${expandido ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        className={`grid transition-all duration-300 ease-out ${
          expandido ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="space-y-1.5 px-3 pb-2">
            {lancamento.observacoes && (
              <p className="rounded-2xl border border-[#1C3D2E] bg-black/35 p-2 text-[11px] leading-4 text-[#91A99C]">
                {lancamento.observacoes}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={alternarStatus}
                className="flex min-h-[34px] items-center justify-center gap-1.5 rounded-2xl border border-[#1C3D2E] bg-black/35 text-[11px] font-black text-[#3AF2A1] active:scale-[0.98]"
              >
                {lancamento.status === 'pago' ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
                {lancamento.status === 'pago' ? 'Pendente' : 'Pago'}
              </button>

              <button
                onClick={excluir}
                className="flex min-h-[34px] items-center justify-center gap-1.5 rounded-2xl border border-red-900/60 bg-red-950/30 text-[11px] font-black text-red-300 active:scale-[0.98]"
              >
                <Trash2 size={13} />
                Excluir
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}