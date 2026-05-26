import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  CheckCircle2,
  Edit3,
  Plus,
  Save,
  Target,
  Trash2,
  X,
  XCircle
} from 'lucide-react'

import { db, criarRegistroBase, agoraISO, softDelete } from '../db/database'
import { agendarSync } from '../sync/syncManager'
import { IconeCategoria } from '../components/IconeCategoria'

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

const encontrarCategoriaDoLancamento = (categorias, lancamento) => {
  return categorias.find(
    (categoria) =>
      categoria.uuid === lancamento.categoriaUuid ||
      Number(categoria.id) === Number(lancamento.categoriaId)
  )
}

const encontrarCategoriaDaMeta = (categorias, meta) => {
  return categorias.find(
    (categoria) =>
      categoria.uuid === meta.categoriaUuid ||
      Number(categoria.id) === Number(meta.categoriaId)
  )
}

const encontrarSubcategoriaDaMeta = (subcategorias, meta) => {
  return subcategorias.find(
    (subcategoria) =>
      subcategoria.uuid === meta.subcategoriaUuid ||
      Number(subcategoria.id) === Number(meta.subcategoriaId)
  )
}

const obterMesAtual = () => new Date().toISOString().slice(0, 7)
const obterAnoAtual = () => String(new Date().getFullYear())

const obterDataFimMes = (mesRef) => {
  const [ano, mes] = String(mesRef || '').split('-').map(Number)

  if (!ano || !mes) return ''

  const ultimoDia = new Date(ano, mes, 0).getDate()
  return `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`
}

const obterIntervaloMeta = (meta) => {
  if (meta.periodoTipo === 'anual') {
    const ano = meta.anoReferencia || obterAnoAtual()

    return {
      inicio: `${ano}-01-01`,
      fim: `${ano}-12-31`
    }
  }

  if (meta.periodoTipo === 'personalizado') {
    return {
      inicio: meta.dataInicio || `${obterMesAtual()}-01`,
      fim: meta.dataFim || obterDataFimMes(obterMesAtual())
    }
  }

  const mes = meta.mesReferencia || obterMesAtual()

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

const calcularMeta = ({ meta, lancamentos, categorias }) => {
  const valorAlvo = Number(meta.valorAlvo || meta.valor || 0)
  const intervalo = obterIntervaloMeta(meta)

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
      if (!meta.subcategoriaId && !meta.subcategoriaUuid) return true

return (
  lancamento.subcategoriaUuid === meta.subcategoriaUuid ||
  Number(lancamento.subcategoriaId) === Number(meta.subcategoriaId)
)
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

const estadoInicialFormulario = {
  id: null,
  nome: '',
  tipo: 'gasto_categoria',
  periodoTipo: 'mensal',
  mesReferencia: obterMesAtual(),
  anoReferencia: obterAnoAtual(),
  dataInicio: `${obterMesAtual()}-01`,
  dataFim: obterDataFimMes(obterMesAtual()),
  categoriaId: '',
  subcategoriaId: '',
  valorAlvo: '',
  mostrarNoDashboard: true,
  ativa: true
}

export default function Metas() {
  const [formulario, setFormulario] = useState(estadoInicialFormulario)
  const [formularioAberto, setFormularioAberto] = useState(false)

  const metas = useLiveQuery(async () => {
    const todas = await db.metas.toArray()
    return todas.filter((meta) => !meta.deletedAt)
  }, [])

  const categorias = useLiveQuery(async () => {
    const todas = await db.categorias.toArray()
    return todas.filter((categoria) => !categoria.deletedAt)
  }, [])

  const subcategorias = useLiveQuery(async () => {
    const todas = await db.subcategorias.toArray()
    return todas.filter((subcategoria) => !subcategoria.deletedAt)
  }, [])

  const lancamentos = useLiveQuery(async () => {
    const todos = await db.lancamentos.toArray()
    return todos.filter((lancamento) => !lancamento.deletedAt)
  }, [])

  const subcategoriasDaCategoria = useMemo(() => {
  if (!subcategorias || !categorias || !formulario.categoriaId) return []

  const categoriaSelecionada = categorias.find(
    (categoria) => Number(categoria.id) === Number(formulario.categoriaId)
  )

  if (!categoriaSelecionada) return []

  return subcategorias.filter(
    (subcategoria) =>
      subcategoria.categoriaUuid === categoriaSelecionada.uuid ||
      Number(subcategoria.categoriaId) === Number(categoriaSelecionada.id)
  )
}, [subcategorias, categorias, formulario.categoriaId])

  const metasComResultado = useMemo(() => {
    if (!metas || !lancamentos || !categorias) return []

    return metas
      .map((meta) => {
        const categoria = encontrarCategoriaDaMeta(categorias, meta)

        const subcategoria = encontrarSubcategoriaDaMeta(subcategorias || [], meta)

        return {
          ...meta,
          categoria,
          subcategoria,
          resultado: calcularMeta({ meta, lancamentos, categorias })
        }
      })
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
  }, [metas, lancamentos, categorias, subcategorias])

  const atualizarCampo = (campo, valor) => {
    setFormulario((atual) => ({
      ...atual,
      [campo]: valor
    }))
  }

  const iniciarNovaMeta = () => {
    setFormulario(estadoInicialFormulario)
    setFormularioAberto(true)
  }

  const editarMeta = (meta) => {
    setFormulario({
      id: meta.id,
      nome: meta.nome || meta.descricao || '',
      tipo: meta.tipo || 'gasto_categoria',
      periodoTipo: meta.periodoTipo || 'mensal',
      mesReferencia: meta.mesReferencia || obterMesAtual(),
      anoReferencia: meta.anoReferencia || obterAnoAtual(),
      dataInicio: meta.dataInicio || `${obterMesAtual()}-01`,
      dataFim: meta.dataFim || obterDataFimMes(obterMesAtual()),
      categoriaId: meta.categoriaId ? String(meta.categoriaId) : '',
      subcategoriaId: meta.subcategoriaId ? String(meta.subcategoriaId) : '',
      valorAlvo: formatarCampoMoeda(String(Math.round(Number(meta.valorAlvo || meta.valor || 0) * 100))),
      mostrarNoDashboard: Boolean(meta.mostrarNoDashboard),
      ativa: meta.ativa !== false
    })

    setFormularioAberto(true)
  }

  const cancelarFormulario = () => {
    setFormulario(estadoInicialFormulario)
    setFormularioAberto(false)
  }

  const salvarMeta = async () => {
    const nome = formulario.nome.trim()
    const valorAlvo = moedaParaNumero(formulario.valorAlvo)

    if (!nome) {
      alert('Informe um nome para a meta.')
      return
    }

    if (!valorAlvo || valorAlvo <= 0) {
      alert('Informe um valor de meta válido.')
      return
    }

    if (formulario.tipo === 'gasto_categoria' && !formulario.categoriaId) {
      alert('Selecione uma categoria para a meta de gasto.')
      return
    }

    if (formulario.periodoTipo === 'personalizado' && (!formulario.dataInicio || !formulario.dataFim)) {
      alert('Informe a data inicial e final da meta personalizada.')
      return
    }

    const categoriaSelecionada = categorias.find(
  (categoria) => Number(categoria.id) === Number(formulario.categoriaId)
)

const subcategoriaSelecionada = subcategorias.find(
  (subcategoria) => Number(subcategoria.id) === Number(formulario.subcategoriaId)
)

    const dados = {
      nome,
      categoriaUuid:
  formulario.tipo === 'gasto_categoria'
    ? categoriaSelecionada?.uuid || null
    : null,

subcategoriaUuid:
  formulario.tipo === 'gasto_categoria' && formulario.subcategoriaId
    ? subcategoriaSelecionada?.uuid || null
    : null,
      tipo: formulario.tipo,
      periodoTipo: formulario.periodoTipo,
      mesReferencia: formulario.periodoTipo === 'mensal' ? formulario.mesReferencia : null,
      anoReferencia: formulario.periodoTipo === 'anual' ? formulario.anoReferencia : null,
      dataInicio: formulario.periodoTipo === 'personalizado' ? formulario.dataInicio : null,
      dataFim: formulario.periodoTipo === 'personalizado' ? formulario.dataFim : null,
      categoriaId: formulario.tipo === 'gasto_categoria' ? Number(formulario.categoriaId) : null,
      subcategoriaId:
        formulario.tipo === 'gasto_categoria' && formulario.subcategoriaId
          ? Number(formulario.subcategoriaId)
          : null,
      valorAlvo,
      mostrarNoDashboard: Boolean(formulario.mostrarNoDashboard),
      ativa: Boolean(formulario.ativa),
      updatedAt: agoraISO(),
      syncStatus: 'pending'
    }

    if (formulario.id) {
      await db.metas.update(formulario.id, dados)
    } else {
      await db.metas.add({
        ...criarRegistroBase(),
        ...dados
      })
    }

    agendarSync()
    cancelarFormulario()
  }

  const excluirMeta = async (meta) => {
    const confirmar = confirm(`Excluir a meta "${meta.nome || meta.descricao || 'Meta'}"?`)

    if (!confirmar) return

    await softDelete('metas', meta.id)
    agendarSync()
  }

  const alternarAtiva = async (meta) => {
    await db.metas.update(meta.id, {
      ativa: meta.ativa === false,
      updatedAt: agoraISO(),
      syncStatus: 'pending'
    })

    agendarSync()
  }

  const alternarDashboard = async (meta) => {
    await db.metas.update(meta.id, {
      mostrarNoDashboard: !meta.mostrarNoDashboard,
      updatedAt: agoraISO(),
      syncStatus: 'pending'
    })

    agendarSync()
  }

  if (!metas || !categorias || !subcategorias || !lancamentos) {
    return (
      <div className="space-y-4 pb-24">
        <h1 className="text-3xl font-black tracking-tight text-[#F4FFF8]">Metas</h1>
        <p className="text-sm text-[#91A99C]">Carregando metas...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-24">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-black uppercase tracking-[0.24em] text-[#3AF2A1]">
            Planejamento
          </p>

          <h1 className="texto-metalico-verde text-3xl font-black tracking-tight">
            Metas
          </h1>

          <p className="mt-1 text-sm text-[#91A99C]">
            Controle seus limites e objetivos financeiros.
          </p>
        </div>

        <button
          onClick={iniciarNovaMeta}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3AF2A1] via-[#0F9D58] to-[#021A10] text-white shadow-[0_0_24px_rgba(58,242,161,0.20)] active:scale-95"
        >
          <Plus size={24} />
        </button>
      </header>

      {formularioAberto && (
        <section className="card-premium rounded-[30px] p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#3AF2A1]">
                {formulario.id ? 'Editar meta' : 'Nova meta'}
              </p>
              <h2 className="mt-1 text-xl font-black text-[#F4FFF8]">
                Configure o objetivo
              </h2>
            </div>

            <button
              onClick={cancelarFormulario}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#1C2A24] bg-[#030504] text-[#91A99C]"
            >
              <X size={18} />
            </button>
          </div>

          <div className="space-y-3">
            <CampoTexto
              label="Nome da meta"
              value={formulario.nome}
              onChange={(valor) => atualizarCampo('nome', valor)}
              placeholder="Ex: Mercado do mês"
            />

            <CampoSelect
              label="Tipo de meta"
              value={formulario.tipo}
              onChange={(valor) => {
                atualizarCampo('tipo', valor)
                if (valor === 'saldo_minimo') {
                  atualizarCampo('categoriaId', '')
                  atualizarCampo('subcategoriaId', '')
                }
              }}
              opcoes={[
                ['gasto_categoria', 'Gasto máximo por categoria'],
                ['saldo_minimo', 'Economia / saldo mínimo']
              ]}
            />

            <CampoSelect
              label="Período"
              value={formulario.periodoTipo}
              onChange={(valor) => atualizarCampo('periodoTipo', valor)}
              opcoes={[
                ['mensal', 'Mensal'],
                ['anual', 'Anual'],
                ['personalizado', 'Personalizado']
              ]}
            />

            {formulario.periodoTipo === 'mensal' && (
              <CampoTexto
                label="Mês de referência"
                type="month"
                value={formulario.mesReferencia}
                onChange={(valor) => atualizarCampo('mesReferencia', valor)}
              />
            )}

            {formulario.periodoTipo === 'anual' && (
              <CampoTexto
                label="Ano"
                type="number"
                value={formulario.anoReferencia}
                onChange={(valor) => atualizarCampo('anoReferencia', valor)}
              />
            )}

            {formulario.periodoTipo === 'personalizado' && (
              <div className="grid grid-cols-2 gap-2">
                <CampoTexto
                  label="Data inicial"
                  type="date"
                  value={formulario.dataInicio}
                  onChange={(valor) => atualizarCampo('dataInicio', valor)}
                />

                <CampoTexto
                  label="Data final"
                  type="date"
                  value={formulario.dataFim}
                  onChange={(valor) => atualizarCampo('dataFim', valor)}
                />
              </div>
            )}

            {formulario.tipo === 'gasto_categoria' && (
              <>
                <CampoSelect
                  label="Categoria"
                  value={formulario.categoriaId}
                  onChange={(valor) => {
                    atualizarCampo('categoriaId', valor)
                    atualizarCampo('subcategoriaId', '')
                  }}
                  opcoes={categorias
                    .filter((categoria) => categoria.tipo === 'despesa' || categoria.tipo === 'ambos')
                    .filter((categoria) => !categoriaEhReembolso(categoria))
                    .map((categoria) => [String(categoria.id), categoria.nome])}
                  placeholder="Selecione"
                />

                <CampoSelect
                  label="Subcategoria opcional"
                  value={formulario.subcategoriaId}
                  disabled={!formulario.categoriaId}
                  onChange={(valor) => atualizarCampo('subcategoriaId', valor)}
                  opcoes={subcategoriasDaCategoria.map((subcategoria) => [String(subcategoria.id), subcategoria.nome])}
                  placeholder="Todas"
                />
              </>
            )}

            <CampoTexto
              label="Valor da meta"
              value={formulario.valorAlvo}
              inputMode="numeric"
              onChange={(valor) => atualizarCampo('valorAlvo', formatarCampoMoeda(valor))}
              placeholder="R$ 0,00"
            />

            <div className="grid grid-cols-2 gap-2">
              <BotaoCheck
                ativo={formulario.mostrarNoDashboard}
                onClick={() => atualizarCampo('mostrarNoDashboard', !formulario.mostrarNoDashboard)}
              >
                Mostrar no dash
              </BotaoCheck>

              <BotaoCheck
                ativo={formulario.ativa}
                onClick={() => atualizarCampo('ativa', !formulario.ativa)}
              >
                Meta ativa
              </BotaoCheck>
            </div>

            <button
              onClick={salvarMeta}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#3AF2A1] via-[#0F9D58] to-[#021A10] text-sm font-black text-white shadow-[0_0_24px_rgba(58,242,161,0.22)] active:scale-[0.98]"
            >
              <Save size={18} />
              Salvar meta
            </button>
          </div>
        </section>
      )}

      <section className="space-y-3">
        {metasComResultado.length === 0 && (
          <div className="card-premium rounded-[28px] p-4">
            <p className="text-sm font-semibold text-[#91A99C]">
              Nenhuma meta cadastrada ainda.
            </p>
          </div>
        )}

        {metasComResultado.map((meta) => (
          <CardMeta
            key={meta.id}
            meta={meta}
            onEditar={() => editarMeta(meta)}
            onExcluir={() => excluirMeta(meta)}
            onAlternarAtiva={() => alternarAtiva(meta)}
            onAlternarDashboard={() => alternarDashboard(meta)}
          />
        ))}
      </section>
    </div>
  )
}

function CampoTexto({ label, value, onChange, placeholder, type = 'text', inputMode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.18em] text-[#3AF2A1]">
        {label}
      </span>

      <input
        type={type}
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-[46px] w-full rounded-2xl border border-[#1C2A24] bg-[#030504]/80 px-3 text-sm font-semibold text-[#F4FFF8] outline-none placeholder:text-[#587367] focus:border-[#3AF2A1]"
      />
    </label>
  )
}

function CampoSelect({ label, value, onChange, opcoes, placeholder, disabled = false }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.18em] text-[#3AF2A1]">
        {label}
      </span>

      <select
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[46px] w-full rounded-2xl border border-[#1C2A24] bg-[#030504]/80 px-3 text-sm font-semibold text-[#F4FFF8] outline-none focus:border-[#3AF2A1] disabled:opacity-50"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {opcoes.map(([valor, texto]) => (
          <option key={valor} value={valor}>
            {texto}
          </option>
        ))}
      </select>
    </label>
  )
}

function BotaoCheck({ ativo, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[42px] items-center justify-center gap-2 rounded-2xl border px-3 text-xs font-black transition active:scale-[0.98] ${
        ativo
          ? 'border-[#3AF2A1]/50 bg-[#3AF2A1]/10 text-[#3AF2A1]'
          : 'border-[#1C2A24] bg-[#030504]/80 text-[#91A99C]'
      }`}
    >
      {ativo ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
      {children}
    </button>
  )
}

function CardMeta({ meta, onEditar, onExcluir, onAlternarAtiva, onAlternarDashboard }) {
  const resultado = meta.resultado || {}
  const percentual = Number(resultado.percentual || 0)
  const alerta = Boolean(resultado.alerta)
  const tipoSaldo = meta.tipo === 'saldo_minimo'

  return (
    <div className="card-premium rounded-[28px] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-2xl border ${
                alerta
                  ? 'border-red-900/60 bg-red-950/30 text-red-300'
                  : 'border-[#3AF2A1]/40 bg-[#3AF2A1]/10 text-[#3AF2A1]'
              }`}
            >
              <Target size={16} />
            </div>

            <p className="truncate text-base font-black text-[#F4FFF8]">
              {meta.nome || meta.descricao || 'Meta'}
            </p>
          </div>

          <p className={`text-xs font-semibold ${alerta ? 'text-red-300' : 'text-[#91A99C]'}`}>
            {resultado.textoStatus || 'Acompanhando meta'}
          </p>
        </div>

        <p className={`shrink-0 text-sm font-black ${alerta ? 'text-red-300' : 'text-[#3AF2A1]'}`}>
          {percentual.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%
        </p>
      </div>

      {meta.categoria && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-[#1C2A24] bg-[#030504]/70 px-3 py-2">
          <IconeCategoria
            icone={meta.categoria.icone}
            cor={meta.categoria.cor}
            tamanho="sm"
          />

          <div className="min-w-0">
            <p className="truncate text-xs font-black text-[#F4FFF8]">
              {meta.categoria.nome}
            </p>
            <p className="truncate text-[11px] text-[#91A99C]">
              {meta.subcategoria?.nome || 'Todas as subcategorias'}
            </p>
          </div>
        </div>
      )}

      <div className="h-2 overflow-hidden rounded-full bg-[#102018]">
        <div
          className={`h-full rounded-full ${alerta ? 'bg-red-400' : 'bg-[#3AF2A1]'}`}
          style={{ width: `${Math.min(Math.max(percentual, 3), 100)}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-[#91A99C]">
        <span>{tipoSaldo ? 'Saldo atual' : 'Usado'}: {formatarMoeda(resultado.atual)}</span>
        <span>Meta: {formatarMoeda(resultado.valorAlvo)}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <BotaoCheck ativo={meta.ativa !== false} onClick={onAlternarAtiva}>
          {meta.ativa === false ? 'Inativa' : 'Ativa'}
        </BotaoCheck>

        <BotaoCheck ativo={Boolean(meta.mostrarNoDashboard)} onClick={onAlternarDashboard}>
          Dashboard
        </BotaoCheck>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          onClick={onEditar}
          className="flex min-h-[40px] items-center justify-center gap-2 rounded-2xl border border-[#1C2A24] bg-[#030504]/80 text-xs font-black text-[#D8E6DE] active:scale-[0.98]"
        >
          <Edit3 size={14} />
          Editar
        </button>

        <button
          onClick={onExcluir}
          className="flex min-h-[40px] items-center justify-center gap-2 rounded-2xl border border-red-900/60 bg-red-950/30 text-xs font-black text-red-300 active:scale-[0.98]"
        >
          <Trash2 size={14} />
          Excluir
        </button>
      </div>
    </div>
  )
}
