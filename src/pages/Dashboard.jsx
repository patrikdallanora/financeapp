import { CardResumo, CardAnaliseCategorias, ComparacaoMensal } from '../components/DashboardComparativo'
import { mesAnterior, selecionarLancamentosMes, resumirMes, compararCategorias } from '../utils/comparacaoMensal.js'
import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowDown,
  ArrowUp,
  CreditCard,
  Plus,
  X
} from 'lucide-react'

import { db } from '../db/database'

const formatarMoeda = (valor) => {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
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

const formatarPercentual = (valor) => {
  return `${Number(valor || 0).toLocaleString('pt-BR', {
    maximumFractionDigits: 1
  })}%`
}

const obterChaveUsuarioLancamento = (lancamento, usuarios = []) => {
  const usuario = usuarios.find(
    (item) =>
      item.uuid === lancamento.usuarioUuid ||
      Number(item.id) === Number(lancamento.usuarioId)
  )

  const nome = normalizarTexto(usuario?.nome)

  if (nome === 'pk') return 'PK'
  if (nome === 'grazi') return 'Grazi'

  if (Number(lancamento.usuarioId) === 1) return 'PK'
  if (Number(lancamento.usuarioId) === 2) return 'Grazi'

  return null
}

const encontrarCategoriaDoLancamento = (categorias, lancamento) => {
  return categorias.find(
    (categoria) =>
      categoria.uuid === lancamento.categoriaUuid ||
      Number(categoria.id) === Number(lancamento.categoriaId)
  )
}

const obterDiaFechamentoCartao = (cartao) => {
  const candidatos = [
    cartao?.fechamento,
    cartao?.diaFechamento,
    cartao?.diaFechamentoFatura,
    cartao?.fechamentoFatura
  ]

  const valor = candidatos.find((item) => Number(item) >= 1 && Number(item) <= 31)

  return valor ? Number(valor) : null
}

const obterMesReferenciaDashboard = (cartoes = []) => {
  const hoje = new Date()
  const anoAtual = hoje.getFullYear()
  const mesAtual = hoje.getMonth()
  const diaAtual = hoje.getDate()

  const fechamentos = cartoes
    .map(obterDiaFechamentoCartao)
    .filter((dia) => dia >= 1 && dia <= 31)

  if (fechamentos.length === 0) {
    return obterMesAtual()
  }

  const menorFechamento = Math.min(...fechamentos)
  const mesReferencia = diaAtual > menorFechamento ? mesAtual + 1 : mesAtual
  const dataReferencia = new Date(anoAtual, mesReferencia, 1)

  return dataReferencia.toISOString().slice(0, 7)
}

const formatarMesSelect = (mesRef) => {
  const [ano, mes] = String(mesRef || '').split('-').map(Number)

  if (!ano || !mes) return 'Mês'

  const data = new Date(ano, mes - 1, 1)
  const nomeMes = data.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')

  return `${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}/${String(ano).slice(-2)}`
}


const obterDataFimMes = (mesRef) => {
  const [ano, mes] = String(mesRef || '').split('-').map(Number)

  if (!ano || !mes) return ''

  const ultimoDia = new Date(ano, mes, 0).getDate()
  return `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`
}

const obterIntervaloMeta = (meta, mesReferenciaDashboard) => {
  if (meta.periodoTipo === 'anual') {
    const ano = meta.anoReferencia || String(new Date().getFullYear())

    return {
      inicio: `${ano}-01-01`,
      fim: `${ano}-12-31`
    }
  }

  if (meta.periodoTipo === 'personalizado') {
    return {
      inicio: meta.dataInicio || `${mesReferenciaDashboard}-01`,
      fim: meta.dataFim || obterDataFimMes(mesReferenciaDashboard)
    }
  }

  const mes = meta.mesReferencia || mesReferenciaDashboard

  return {
    inicio: `${mes}-01`,
    fim: obterDataFimMes(mes)
  }
}

const obterDataFinanceiraLancamento = (lancamento) => {
  if (lancamento.metodoPagamento === 'cartao') {
    return lancamento.faturaRef ? `${lancamento.faturaRef}-01` : ''
  }

  return String(lancamento.dataCompetencia || '')
}

const lancamentoDentroDoPeriodo = (lancamento, inicio, fim) => {
  const data = obterDataFinanceiraLancamento(lancamento)

  if (!data) return false

  return data >= inicio && data <= fim
}

const calcularMeta = ({ meta, lancamentos, categorias, mesReferenciaDashboard }) => {
  const valorAlvo = Number(meta.valorAlvo || meta.valor || 0)
  const intervalo = obterIntervaloMeta(meta, mesReferenciaDashboard)

  const lancamentosPeriodo = (lancamentos || [])
    .filter((lancamento) => !lancamento.deletedAt)
    .filter((lancamento) => lancamentoDentroDoPeriodo(lancamento, intervalo.inicio, intervalo.fim))
    .filter((lancamento) => {
      const categoria = encontrarCategoriaDoLancamento(categorias, lancamento)

      return !categoriaEhReembolso(categoria)
    })

  if (meta.tipo === 'saldo_minimo') {
    const receitas = lancamentosPeriodo
      .filter((lancamento) => lancamento.tipo === 'receita')
      .reduce((total, lancamento) => total + Number(lancamento.valor || 0), 0)

    const despesas = lancamentosPeriodo
      .filter((lancamento) => lancamento.tipo === 'despesa')
      .reduce((total, lancamento) => total + Number(lancamento.valor || 0), 0)

    const atual = receitas - despesas
    const percentual = valorAlvo > 0 ? Math.max(0, (atual / valorAlvo) * 100) : 0
    const alerta = valorAlvo > 0 && atual < valorAlvo

    return {
      atual,
      valorAlvo,
      percentual: Math.min(percentual, 100),
      alerta,
      textoStatus: alerta ? 'Abaixo da meta' : 'Meta atingida'
    }
  }

  const atual = lancamentosPeriodo
    .filter((lancamento) => lancamento.tipo === 'despesa')
    .filter((lancamento) => {
  const categoria = encontrarCategoriaDoLancamento(categorias, lancamento)

  return (
    categoria?.uuid === meta.categoriaUuid ||
    Number(categoria?.id) === Number(meta.categoriaId)
  )
})
    .filter((lancamento) => {
      if (!meta.subcategoriaId) return true
      return Number(lancamento.subcategoriaId) === Number(meta.subcategoriaId)
    })
    .reduce((total, lancamento) => total + Number(lancamento.valor || 0), 0)

  const percentual = valorAlvo > 0 ? (atual / valorAlvo) * 100 : 0
  const alerta = valorAlvo > 0 && atual > valorAlvo

  return {
    atual,
    valorAlvo,
    percentual: Math.min(percentual, 100),
    alerta,
    textoStatus: alerta ? 'Limite ultrapassado' : 'Dentro da meta'
  }
}

export default function Dashboard({ onNovoLancamento, onAbrirExtratos }) {
  const [menuAberto, setMenuAberto] = useState(false)
  const [modoCategorias, setModoCategorias] = useState('grafico')

  const lancamentos = useLiveQuery(async () => {
    const todos = await db.lancamentos.toArray()
    return todos.filter((lancamento) => !lancamento.deletedAt)
  }, [])

  const categorias = useLiveQuery(async () => {
    const todas = await db.categorias.toArray()
    return todas.filter((categoria) => !categoria.deletedAt)
  }, [])

  const cartoes = useLiveQuery(async () => {
    const todos = await db.cartoes.toArray()
    return todos.filter((cartao) => !cartao.deletedAt)
  }, [])

  const usuarios = useLiveQuery(async () => {
  const todos = await db.usuarios.toArray()
  return todos.filter((usuario) => !usuario.deletedAt)
}, [])

  const metas = useLiveQuery(async () => {
    const todas = await db.metas.toArray()
    return todas.filter((meta) => !meta.deletedAt)
  }, [])

  const mesReferenciaPadrao = useMemo(() => {
  return obterMesReferenciaDashboard(cartoes || [])
}, [cartoes])

const [mesSelecionado, setMesSelecionado] = useState('')

const mesReferencia = mesSelecionado || mesReferenciaPadrao


  const opcoesMeses = useMemo(() => {
  const meses = new Set()

  if (mesReferenciaPadrao) {
    meses.add(mesReferenciaPadrao)
  }

  ;(lancamentos || []).forEach((lancamento) => {
    if (lancamento.metodoPagamento === 'cartao' && lancamento.faturaRef) {
      meses.add(String(lancamento.faturaRef).slice(0, 7))
      return
    }

    if (lancamento.dataCompetencia) {
      meses.add(String(lancamento.dataCompetencia).slice(0, 7))
    }
  })

  return Array.from(meses).sort((a, b) => b.localeCompare(a))
}, [lancamentos, mesReferenciaPadrao])

  const referenciaAnterior = mesAnterior(mesReferencia)
  const doMes = useMemo(() => selecionarLancamentosMes(lancamentos || [], categorias || [], mesReferencia), [lancamentos, categorias, mesReferencia])
  const doMesAnterior = useMemo(() => selecionarLancamentosMes(lancamentos || [], categorias || [], referenciaAnterior), [lancamentos, categorias, referenciaAnterior])
  const resumoAtual = useMemo(() => resumirMes(doMes), [doMes])
  const resumoAnterior = useMemo(() => resumirMes(doMesAnterior), [doMesAnterior])
  const { receita: totalReceitas, despesa: totalDespesas, saldo } = resumoAtual

  const coresParticipacaoUsuarios = useMemo(() => {
  const encontrarCorCategoria = (...nomes) => {
    const categoria = (categorias || []).find((item) =>
      nomes.includes(normalizarTexto(item.nome))
    )

    return categoria?.cor || null
  }

  return {
    aberto:
      encontrarCorCategoria('casamento') ||
      '#EF6B6B',

    PK:
      encontrarCorCategoria('investimento', 'investimentos') ||
      '#3B82F6',

    Grazi:
      encontrarCorCategoria('carro') ||
      '#60A5FA'
  }
}, [categorias])

  const participacaoUsuarios = useMemo(() => {
    const base = {
      PK: { nome: 'PK', pago: 0, aberto: 0 },
      Grazi: { nome: 'Grazi', pago: 0, aberto: 0 }
    }

    const despesasMes = doMes.filter(
      (lancamento) => lancamento.tipo === 'despesa'
    )

    despesasMes
      .filter((lancamento) => lancamento.metodoPagamento !== 'cartao')
      .forEach((lancamento) => {
        const chaveUsuario = obterChaveUsuarioLancamento(
          lancamento,
          usuarios || []
        )

        if (!chaveUsuario || !base[chaveUsuario]) return

        const valor = Number(lancamento.valor || 0)

        if (lancamento.status === 'pago') {
          base[chaveUsuario].pago += valor
        } else {
          base[chaveUsuario].aberto += valor
        }
      })

    const faturas = new Map()

    despesasMes
      .filter((lancamento) => lancamento.metodoPagamento === 'cartao')
      .forEach((lancamento) => {
        const chaveUsuario = obterChaveUsuarioLancamento(
          lancamento,
          usuarios || []
        )

        if (!chaveUsuario || !base[chaveUsuario]) return

        const chaveCartao =
          lancamento.cartaoUuid ||
          lancamento.cartaoId ||
          'sem-cartao'

        const faturaRef = lancamento.faturaRef || mesReferencia
        const chaveFatura = `${chaveCartao}-${faturaRef}`

        if (!faturas.has(chaveFatura)) {
          faturas.set(chaveFatura, {
            total: 0,
            valorPago: 0,
            valoresPorUsuario: {
              PK: 0,
              Grazi: 0
            }
          })
        }

        const fatura = faturas.get(chaveFatura)
        const valor = Number(lancamento.valor || 0)

        fatura.total += valor
        fatura.valoresPorUsuario[chaveUsuario] += valor

        fatura.valorPago = Math.max(
          fatura.valorPago,
          Number(lancamento.faturaValorPago || 0)
        )
      })

    faturas.forEach((fatura) => {
      if (fatura.total <= 0) return

      const valorPagoEfetivo = Math.min(
        Math.max(Number(fatura.valorPago || 0), 0),
        fatura.total
      )

      Object.entries(fatura.valoresPorUsuario).forEach(
        ([chaveUsuario, totalUsuario]) => {
          if (!base[chaveUsuario] || totalUsuario <= 0) return

          const participacaoUsuario = totalUsuario / fatura.total
          const pagoUsuario = valorPagoEfetivo * participacaoUsuario
          const abertoUsuario = Math.max(totalUsuario - pagoUsuario, 0)

          base[chaveUsuario].pago += pagoUsuario
          base[chaveUsuario].aberto += abertoUsuario
        }
      )
    })

    const lista = Object.values(base).map((usuario) => {
      const total = usuario.pago + usuario.aberto

      return {
        ...usuario,
        total,
        percentualPago: total > 0 ? (usuario.pago / total) * 100 : 0,
        percentualAberto: total > 0 ? (usuario.aberto / total) * 100 : 0
      }
    })

    const totalGeral = lista.reduce(
      (total, usuario) => total + usuario.total,
      0
    )

    return {
      totalGeral,
      usuarios: lista.map((usuario) => ({
        ...usuario,
        percentualTotal:
          totalGeral > 0 ? (usuario.total / totalGeral) * 100 : 0
      }))
    }
  }, [doMes, usuarios, mesReferencia])

  const gastosPorCategoria = useMemo(() => compararCategorias(doMes, doMesAnterior, categorias || []), [doMes, doMesAnterior, categorias])

  const metasDashboard = useMemo(() => {
    if (!metas || !lancamentos || !categorias) return []

    return metas
      .filter((meta) => meta.ativa !== false)
      .filter((meta) => Boolean(meta.mostrarNoDashboard))
      .map((meta) => {
        const resultado = calcularMeta({
          meta,
          lancamentos,
          categorias,
          mesReferenciaDashboard: mesReferencia
        })

        const categoria = categorias.find(
  (item) =>
    item.uuid === meta.categoriaUuid ||
    Number(item.id) === Number(meta.categoriaId)
)

        return {
          ...meta,
          categoria,
          resultado
        }
      })
  }, [metas, lancamentos, categorias, mesReferencia])

  const escolherLancamento = (config) => {
    setMenuAberto(false)
    onNovoLancamento(config)
  }

  const abrirCategoriaNoExtrato = (categoria) => {
    onAbrirExtratos({
      filtro: 'categoria',
      categoriaId: categoria.id,
      categoriaNome: categoria.nome,
      mesReferencia
    })
  }

  return (
    <div className="dashboard-evolucao relative space-y-4 pb-44">
      <header className="mb-4">
        <p className="mb-1 text-xs font-black uppercase tracking-[0.24em] text-[#3AF2A1]">
          FinanceApp
        </p>

        <h1 className="texto-metalico-verde text-2xl font-black tracking-tight">
          Dashboard
        </h1>

        <p className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#91A99C]">
  <span>Resumo financeiro de</span>

  <select
    aria-label="Mês de referência"
    value={mesReferencia}
    onChange={(event) => setMesSelecionado(event.target.value)}
    className="min-h-[44px] rounded-xl border border-[#25362c] bg-[#101b15] px-3 text-sm text-[#F4FFF8]"
  >
    {opcoesMeses.map((mes) => (
      <option key={mes} value={mes}>
        {formatarMesSelect(mes)}
      </option>
    ))}
  </select>
</p>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <CardResumo
          titulo="Receitas"
          indicador="receita"
          anterior={resumoAnterior.receita}
          temAnterior={resumoAnterior.temDados}
          referenciaAnterior={referenciaAnterior}
          valor={totalReceitas}
          tipo="positivo"
          onClick={() =>
  onAbrirExtratos({
    filtro: 'receita',
    mesReferencia
  })
}
        />

        <CardResumo
          titulo="Despesas"
          indicador="despesa"
          anterior={resumoAnterior.despesa}
          temAnterior={resumoAnterior.temDados}
          referenciaAnterior={referenciaAnterior}
          valor={totalDespesas}
          tipo="negativo"
          onClick={() =>
  onAbrirExtratos({
    filtro: 'despesa',
    mesReferencia
  })
}
        />

        <CardResumo
          titulo="Saldo"
          indicador="saldo"
          anterior={resumoAnterior.saldo}
          temAnterior={resumoAnterior.temDados}
          referenciaAnterior={referenciaAnterior}
          valor={saldo}
          tipo={saldo >= 0 ? 'positivo' : 'negativo'}
        />
      </div>

      <ComparacaoMensal atual={resumoAtual} anterior={resumoAnterior} referencia={mesReferencia} referenciaAnterior={referenciaAnterior} />

      <CardAnaliseCategorias
        referencia={mesReferencia}
        referenciaAnterior={referenciaAnterior}
        temAnterior={resumoAnterior.temDados}
        modo={modoCategorias}
        setModo={setModoCategorias}
        categorias={gastosPorCategoria}
        total={totalDespesas}
        onSelecionarCategoria={abrirCategoriaNoExtrato}
      />

      <CardParticipacaoUsuarios
        dados={participacaoUsuarios}
        cores={coresParticipacaoUsuarios}
      />

      <CardMetasDashboard metas={metasDashboard} />

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
        className="home-novo-flutuante"
        aria-label="Novo lançamento"
        aria-expanded={menuAberto}
      >
        <Plus size={28} aria-hidden="true" />
      </button>
    </div>
  )
}

function CardParticipacaoUsuarios({
  dados,
  titulo = 'Gastos por pessoa',
  cores = {}
}) {
  const usuarios = dados?.usuarios || []
  const totalGeral = dados?.totalGeral || 0

  return (
    <section className="card-premium overflow-hidden rounded-[28px] p-0">
      <div className="border-b border-[#1C2A24] p-4">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-[#3AF2A1]">
          Participação
        </p>

        <h2 className="mt-1 text-lg font-black text-[#F4FFF8]">
          {titulo}
        </h2>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <IndicadorUsuario titulo="Total Geral" valor={totalGeral} />

          {usuarios.map((usuario) => (
            <IndicadorUsuario
              key={usuario.nome}
              titulo={usuario.nome}
              valor={usuario.total}
              subtitulo={`${formatarPercentual(usuario.percentualTotal)} do total`}
            />
          ))}
        </div>
      </div>

      <div className="space-y-4 p-4">
        {usuarios.map((usuario) => (
          <BarraUsuarioFinanceiro
            key={usuario.nome}
            usuario={usuario}
            corAberto={cores.aberto}
            corPago={cores[usuario.nome]}
          />
        ))}
      </div>
    </section>
  )
}

function IndicadorUsuario({ titulo, valor, subtitulo }) {
  return (
    <div className="w-full min-w-0 rounded-[18px] border border-[#1C2A24] bg-[#030504]/70 px-2 py-2">
      <p className="text-[10px] font-semibold text-[#91A99C]">
        {titulo}
      </p>

      <p className="mt-1 text-[12px] font-black leading-4 text-[#F4FFF8]">
        {formatarMoeda(valor)}
      </p>

      {subtitulo && (
        <p className="mt-1 text-[9px] font-semibold leading-3 text-[#3AF2A1]">
          {subtitulo}
        </p>
      )}
    </div>
  )
}

function BarraUsuarioFinanceiro({
  usuario,
  corAberto = '#EF6B6B',
  corPago = '#3B82F6'
}) {
  const total = usuario.total || 0
  const aberto = usuario.aberto || 0
  const pago = usuario.pago || 0

  return (
    <div className="rounded-3xl border border-[#1C2A24] bg-[#030504]/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-[#F4FFF8]">
            {usuario.nome}
          </p>

          <p className="mt-0.5 text-[11px] font-semibold text-[#91A99C]">
            Total: {formatarMoeda(total)}
          </p>
        </div>

        <p className="text-xs font-black text-[#3AF2A1]">
          {formatarPercentual(usuario.percentualTotal)}
        </p>
      </div>

      <div className="flex h-9 overflow-hidden rounded-2xl bg-[#102018]">
        <div
          className="flex items-center justify-center px-2 text-[10px] font-black text-white transition-all"
          style={{
            width: `${Math.max(usuario.percentualAberto, aberto > 0 ? 8 : 0)}%`,
            backgroundColor: corAberto
          }}
        >
          {aberto > 0 && `${formatarMoeda(aberto)} · ${formatarPercentual(usuario.percentualAberto)}`}
        </div>

        <div
          className="flex items-center justify-center px-2 text-[10px] font-black text-white transition-all"
          style={{
            width: `${Math.max(usuario.percentualPago, pago > 0 ? 8 : 0)}%`,
            backgroundColor: corPago
          }}
        >
          {pago > 0 && `${formatarMoeda(pago)} · ${formatarPercentual(usuario.percentualPago)}`}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-semibold">
        <p
          className="font-semibold"
          style={{ color: corAberto }}
        >
          Em aberto: {formatarMoeda(aberto)}
        </p>

        <p
          className="text-right font-semibold"
          style={{ color: corPago }}
        >
          Pago: {formatarMoeda(pago)}
        </p>
      </div>
    </div>
  )
}


function CardMetasDashboard({ metas }) {
  if (!metas || metas.length === 0) return null

  return (
    <section className="card-premium rounded-[28px] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#3AF2A1]">
            Metas
          </p>
          <h2 className="mt-1 text-lg font-black text-[#F4FFF8]">
            Metas em destaque
          </h2>
        </div>

        <p className="rounded-full border border-[#1C2A24] bg-[#030504]/80 px-3 py-1 text-[11px] font-black text-[#91A99C]">
          {metas.length}
        </p>
      </div>

      <div className="space-y-3">
        {metas.map((meta) => {
          const resultado = meta.resultado || {}
          const percentual = Number(resultado.percentual || 0)
          const alerta = Boolean(resultado.alerta)
          const tipoSaldo = meta.tipo === 'saldo_minimo'

          return (
            <div
              key={meta.id}
              className="rounded-3xl border border-[#1C2A24] bg-[#030504]/70 p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#F4FFF8]">
                    {meta.nome || meta.descricao || 'Meta'}
                  </p>

                  <p className={`mt-0.5 text-[11px] font-semibold ${alerta ? 'text-red-300' : 'text-[#91A99C]'}`}>
                    {resultado.textoStatus || 'Acompanhando meta'}
                  </p>
                </div>

                <p className={`shrink-0 text-xs font-black ${alerta ? 'text-red-300' : 'text-[#3AF2A1]'}`}>
                  {percentual.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%
                </p>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-[#102018]">
                <div
                  className={`h-full rounded-full ${alerta ? 'bg-red-400' : 'bg-[#3AF2A1]'}`}
                  style={{ width: `${Math.min(Math.max(percentual, 3), 100)}%` }}
                />
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-[#91A99C]">
                <span>
                  {tipoSaldo ? 'Saldo atual' : 'Usado'}: {formatarMoeda(resultado.atual)}
                </span>
                <span>
                  Meta: {formatarMoeda(resultado.valorAlvo)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
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
