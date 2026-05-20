import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CreditCard,
  List,
  Plus,
  X
} from 'lucide-react'

import { db } from '../db/database'
import { IconeCategoria } from '../components/IconeCategoria'

const formatarMoeda = (valor) => {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
}

const formatarNumeroCurto = (valor) => {
  const numero = Number(valor || 0)

  if (numero >= 1000) {
    return `${(numero / 1000).toLocaleString('pt-BR', {
      maximumFractionDigits: 1
    })} mil`
  }

  return numero.toLocaleString('pt-BR', {
    maximumFractionDigits: 0
  })
}

const obterMesAtual = () => new Date().toISOString().slice(0, 7)

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

export default function Dashboard({ onNovoLancamento, onAbrirExtratos }) {
  const [menuAberto, setMenuAberto] = useState(false)
  const [modoCategorias, setModoCategorias] = useState('grafico')
  const mesAtual = obterMesAtual()

  const lancamentos = useLiveQuery(async () => {
    const todos = await db.lancamentos.toArray()
    return todos.filter((lancamento) => !lancamento.deletedAt)
  }, [])

  const categorias = useLiveQuery(async () => {
    const todas = await db.categorias.toArray()
    return todas.filter((categoria) => !categoria.deletedAt)
  }, [])

  const doMes = useMemo(() => {
    if (!lancamentos || !categorias) return []

    return lancamentos
      .filter((lancamento) => lancamento.dataCompetencia?.startsWith(mesAtual))
      .filter((lancamento) => {
        const categoria = categorias.find(
          (item) => Number(item.id) === Number(lancamento.categoriaId)
        )

        return !categoriaEhReembolso(categoria)
      })
  }, [lancamentos, categorias, mesAtual])

  const totalReceitas = doMes
    .filter((lancamento) => lancamento.tipo === 'receita')
    .reduce((total, lancamento) => total + Number(lancamento.valor || 0), 0)

  const totalDespesas = doMes
    .filter((lancamento) => lancamento.tipo === 'despesa')
    .reduce((total, lancamento) => total + Number(lancamento.valor || 0), 0)

  const saldo = totalReceitas - totalDespesas

  const gastosPorCategoria = useMemo(() => {
    if (!categorias) return []

    const mapa = new Map()

    doMes
      .filter((lancamento) => lancamento.tipo === 'despesa')
      .forEach((lancamento) => {
        const categoria = categorias.find(
          (item) => Number(item.id) === Number(lancamento.categoriaId)
        )

        if (!categoria) return
        if (categoriaEhReembolso(categoria)) return

        const chave = Number(categoria.id)
        const atual = mapa.get(chave) || {
          id: categoria.id,
          nome: categoria.nome,
          cor: categoria.cor,
          icone: categoria.icone,
          total: 0
        }

        atual.total += Number(lancamento.valor || 0)
        mapa.set(chave, atual)
      })

    const lista = Array.from(mapa.values()).sort((a, b) => b.total - a.total)
    const maiorValor = lista[0]?.total || 0

    return lista.map((item) => ({
      ...item,
      percentual: totalDespesas > 0 ? (item.total / totalDespesas) * 100 : 0,
      largura: maiorValor > 0 ? (item.total / maiorValor) * 100 : 0
    }))
  }, [doMes, categorias, totalDespesas])

  const escolherLancamento = (config) => {
    setMenuAberto(false)
    onNovoLancamento(config)
  }

  const abrirCategoriaNoExtrato = (categoria) => {
    onAbrirExtratos({
      filtro: 'categoria',
      categoriaId: categoria.id,
      categoriaNome: categoria.nome
    })
  }

  return (
    <div className="relative space-y-4 pb-24">
      <header className="mb-4">
        <p className="mb-1 text-xs font-black uppercase tracking-[0.24em] text-[#3AF2A1]">
          FinanceApp
        </p>

        <h1 className="texto-metalico-verde text-2xl font-black tracking-tight">
          Dashboard
        </h1>

        <p className="mt-1 text-sm text-[#91A99C]">
          Resumo financeiro do mês atual.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <CardResumo
          titulo="Receitas"
          valor={totalReceitas}
          tipo="positivo"
          onClick={() => onAbrirExtratos('receita')}
        />

        <CardResumo
          titulo="Despesas"
          valor={totalDespesas}
          tipo="negativo"
          onClick={() => onAbrirExtratos('despesa')}
        />

        <CardResumo
          titulo="Saldo"
          valor={saldo}
          tipo={saldo >= 0 ? 'positivo' : 'negativo'}
        />
      </div>

      <CardAnaliseCategorias
        modo={modoCategorias}
        setModo={setModoCategorias}
        categorias={gastosPorCategoria}
        total={totalDespesas}
        onSelecionarCategoria={abrirCategoriaNoExtrato}
      />

      {menuAberto && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 px-4 pb-28 backdrop-blur-sm">
          <div className="card-premium w-full max-w-[398px] rounded-[32px] p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#3AF2A1]">
                  Novo lançamento
                </p>
                <p className="mt-1 text-sm text-[#91A99C]">
                  Escolha o tipo para começar.
                </p>
              </div>

              <button
                onClick={() => setMenuAberto(false)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#1C2A24] bg-[#030504] text-[#91A99C]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2">
              <OpcaoLancamento
                icone={ArrowUp}
                titulo="Receita"
                subtitulo="Entrada de dinheiro"
                cor="#3AF2A1"
                onClick={() =>
                  escolherLancamento({
                    tipo: 'receita',
                    metodoPagamento: 'pix'
                  })
                }
              />

              <OpcaoLancamento
                icone={ArrowDown}
                titulo="Despesa"
                subtitulo="Saída via PIX ou dinheiro"
                cor="#F43F5E"
                onClick={() =>
                  escolherLancamento({
                    tipo: 'despesa',
                    metodoPagamento: 'pix'
                  })
                }
              />

              <OpcaoLancamento
                icone={CreditCard}
                titulo="Despesa cartão"
                subtitulo="Compra vinculada à fatura"
                cor="#3B82F6"
                onClick={() =>
                  escolherLancamento({
                    tipo: 'despesa',
                    metodoPagamento: 'cartao'
                  })
                }
              />
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setMenuAberto(true)}
        className="fixed bottom-24 right-5 z-30 flex h-16 w-16 items-center justify-center rounded-[24px] bg-gradient-to-br from-[#3AF2A1] via-[#0F9D58] to-[#021A10] text-white glow-verde active:scale-95"
      >
        <Plus size={30} />
      </button>
    </div>
  )
}

function CardResumo({ titulo, valor, tipo, onClick }) {
  const positivo = tipo === 'positivo'
  const Component = onClick ? 'button' : 'div'

  return (
    <Component
      onClick={onClick}
      className={`
        card-premium min-w-0 rounded-[22px] px-2.5 py-3 text-left
        ${onClick ? 'transition active:scale-[0.99]' : ''}
      `}
    >
      <p className="truncate text-[10px] font-semibold text-[#91A99C]">
        {titulo}
      </p>

      <p
        className={`mt-1 truncate text-[13px] font-black leading-4 ${
          positivo ? 'text-[#3AF2A1]' : 'text-red-300'
        }`}
      >
        {formatarMoeda(valor)}
      </p>
    </Component>
  )
}

function CardAnaliseCategorias({
  modo,
  setModo,
  categorias,
  total,
  onSelecionarCategoria
}) {
  return (
    <section className="card-premium overflow-hidden rounded-[28px] p-0">
      <div className="flex items-start justify-between gap-3 border-b border-[#1C2A24] p-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#3AF2A1]">
            Análise
          </p>

          <h2 className="mt-1 text-lg font-black text-[#F4FFF8]">
            Gastos por categoria
          </h2>

          <p className="mt-1 text-xs text-[#91A99C]">
            Total analisado:{' '}
            <span className="font-black text-[#3AF2A1]">
              {formatarMoeda(total)}
            </span>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setModo('grafico')}
            className={`
              relative flex min-h-[58px] min-w-[68px] flex-col items-center justify-center rounded-2xl border text-xs font-black transition active:scale-[0.98]
              ${
                modo === 'grafico'
                  ? 'border-[#3AF2A1]/70 bg-[#3AF2A1]/10 text-[#3AF2A1] shadow-[0_0_20px_rgba(58,242,161,0.12)]'
                  : 'border-[#1C2A24] bg-[#030504]/80 text-[#91A99C]'
              }
            `}
          >
            <BarChart3 size={22} />
            <span className="mt-1">Gráfico</span>

            {modo === 'grafico' && (
              <span className="absolute -bottom-[1px] h-1 w-8 rounded-t-full bg-[#3AF2A1]" />
            )}
          </button>

          <button
            onClick={() => setModo('lista')}
            className={`
              relative flex min-h-[58px] min-w-[68px] flex-col items-center justify-center rounded-2xl border text-xs font-black transition active:scale-[0.98]
              ${
                modo === 'lista'
                  ? 'border-[#3AF2A1]/70 bg-[#3AF2A1]/10 text-[#3AF2A1] shadow-[0_0_20px_rgba(58,242,161,0.12)]'
                  : 'border-[#1C2A24] bg-[#030504]/80 text-[#91A99C]'
              }
            `}
          >
            <List size={22} />
            <span className="mt-1">Lista</span>

            {modo === 'lista' && (
              <span className="absolute -bottom-[1px] h-1 w-8 rounded-t-full bg-[#3AF2A1]" />
            )}
          </button>
        </div>
      </div>

      <div className="p-4">
        {categorias.length === 0 ? (
          <div className="rounded-3xl border border-[#1C2A24] bg-[#030504]/70 p-4">
            <p className="text-sm font-semibold text-[#91A99C]">
              Nenhuma despesa encontrada no mês atual.
            </p>
          </div>
        ) : modo === 'grafico' ? (
          <GraficoBarrasCategorias
            categorias={categorias}
            onSelecionarCategoria={onSelecionarCategoria}
          />
        ) : (
          <ListaCategoriasAtual
            categorias={categorias}
            onSelecionarCategoria={onSelecionarCategoria}
          />
        )}
      </div>
    </section>
  )
}

function ListaCategoriasAtual({ categorias, onSelecionarCategoria }) {
  return (
    <div className="space-y-3">
      {categorias.slice(0, 6).map((categoria) => (
        <button
          key={categoria.id}
          onClick={() => onSelecionarCategoria(categoria)}
          className="w-full rounded-3xl border border-[#1C2A24] bg-[#030504]/70 p-3 text-left transition active:scale-[0.99]"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <IconeCategoria
                icone={categoria.icone}
                cor={categoria.cor}
                tamanho="sm"
                ativo
              />

              <p className="truncate text-sm font-black text-[#F4FFF8]">
                {categoria.nome}
              </p>
            </div>

            <p className="shrink-0 text-xs font-black text-red-300">
              {formatarMoeda(categoria.total)}
            </p>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-[#102018]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(categoria.largura || 0, 4)}%`,
                backgroundColor: categoria.cor || '#3AF2A1',
                boxShadow: `0 0 14px ${categoria.cor || '#3AF2A1'}55`
              }}
            />
          </div>
        </button>
      ))}
    </div>
  )
}

function GraficoBarrasCategorias({ categorias, onSelecionarCategoria }) {
  const maiorValor = categorias[0]?.total || 0
  const meioValor = maiorValor / 2

  return (
    <div className="overflow-hidden rounded-[26px] border border-[#1C2A24] bg-[#151515] px-3 pb-3 pt-4">
      <div className="relative">
        <div className="pointer-events-none absolute bottom-0 left-[132px] top-0 w-px bg-[#8A8A8A]/55" />
        <div className="pointer-events-none absolute bottom-0 left-[calc(132px+((100%-132px-42px)/2))] top-0 w-px bg-[#8A8A8A]/35" />
        <div className="pointer-events-none absolute bottom-0 right-[42px] top-0 w-px bg-[#8A8A8A]/45" />

        <div className="relative space-y-3.5">
          {categorias.map((categoria) => (
            <LinhaGraficoCategoria
              key={categoria.id}
              categoria={categoria}
              onSelecionarCategoria={onSelecionarCategoria}
            />
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[132px_minmax(0,1fr)_42px] text-[11px] font-semibold text-[#9CA3AF]">
        <div />

        <div className="grid grid-cols-3">
          <p className="text-left">0</p>
          <p className="text-center">{formatarNumeroCurto(meioValor)}</p>
          <p className="text-right">{formatarNumeroCurto(maiorValor)}</p>
        </div>

        <div />
      </div>
    </div>
  )
}

function LinhaGraficoCategoria({ categoria, onSelecionarCategoria }) {
  const cor = categoria.cor || '#3AF2A1'

  const percentualTexto = categoria.percentual.toLocaleString('pt-BR', {
    maximumFractionDigits: 1
  })

  return (
    <button
      onClick={() => onSelecionarCategoria(categoria)}
      className="grid w-full grid-cols-[42px_90px_minmax(0,1fr)_42px] items-center text-left active:scale-[0.995]"
    >
      <div className="flex justify-start">
        <IconeCategoria
          icone={categoria.icone}
          cor={cor}
          tamanho="sm"
          ativo
        />
      </div>

      <p className="truncate pr-3 text-left text-[12px] font-semibold text-[#D8E6DE]">
        {categoria.nome}
      </p>

      <div className="relative h-">
        <div
          className="flex h-7 items-center rounded-r-full transition-all duration-500"
          style={{
            width: `${Math.max(categoria.largura || 0, 6)}%`,
            background: `linear-gradient(90deg, ${cor}, ${cor}dd, ${cor}aa)`,
            boxShadow: `0 0 18px ${cor}35`
          }}
        />
      </div>

      <p className="pl-2 text-right text-[12px] font-black text-[#D8E6DE]">
        {percentualTexto}%
      </p>
    </button>
  )
}

function OpcaoLancamento({ icone: Icone, titulo, subtitulo, cor, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-3xl border border-[#1C2A24] bg-[#030504]/80 p-4 text-left transition active:scale-[0.99]"
    >
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border"
        style={{
          color: cor,
          borderColor: `${cor}55`,
          background: `linear-gradient(145deg, ${cor}22, #030504 70%)`
        }}
      >
        <Icone size={24} strokeWidth={2.3} />
      </div>

      <div>
        <p className="text-base font-black text-[#F4FFF8]">{titulo}</p>
        <p className="mt-1 text-xs text-[#91A99C]">{subtitulo}</p>
      </div>
    </button>
  )
}