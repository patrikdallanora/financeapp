import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, ChevronDown, Save, Sparkles } from 'lucide-react'

import { db, criarRegistroBase, agora, gerarUUID } from '../db/database'
import { agendarSync } from '../sync/syncManager'
import { Botao } from '../components/Botao'
import { CampoTexto } from '../components/CampoTexto'
import { CardPremium } from '../components/CardPremium'
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

const adicionarMeses = (dataBase, quantidade) => {
  const [ano, mes, dia] = dataBase.split('-').map(Number)
  const data = new Date(ano, mes - 1 + quantidade, dia)
  return data.toISOString().slice(0, 10)
}

const adicionarMesesFatura = (faturaRef, quantidade) => {
  const [ano, mes] = faturaRef.split('-').map(Number)
  const data = new Date(ano, mes - 1 + quantidade, 1)
  return data.toISOString().slice(0, 7)
}

const calcularFaturaAtualCartao = (dataCompetencia, cartao) => {
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
    if (!categoriaId) return 'Selecione uma categoria.'
    if (!subcategoriaId) return 'Selecione uma subcategoria.'

    if (metodoPagamento === 'cartao') {
      if (!cartaoId) return 'Selecione o cartão.'
      if (!faturaSelecionada) return 'Selecione a fatura de referência.'
    }

    if (tipoLancamento === 'parcelado') {
      if (!parcelaAtual || Number(parcelaAtual) < 1) return 'Informe a parcela atual.'
      if (!totalParcelas || Number(totalParcelas) < 2) return 'Informe o total de parcelas.'

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
      subcategoriaId: Number(subcategoriaId),
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

    for (let parcela = 1; parcela <= total; parcela++) {
      const offset = parcela - atual
      const pagoRetroativo = parcela < atual

      await db.lancamentos.add({
        ...criarRegistroBase(),
        ...base,
        status: pagoRetroativo ? 'pago' : 'pendente',
        dataPagamento: pagoRetroativo ? adicionarMeses(dataCompetencia, offset) : null,
        dataCompetencia: adicionarMeses(dataCompetencia, offset),
        faturaRef:
          metodoPagamento === 'cartao'
            ? adicionarMesesFatura(faturaSelecionada, parcela - 1)
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
    const erro = validar()

    if (erro) {
      alert(erro)
      return
    }

    if (tipoLancamento === 'simples') {
      await salvarSimples()
    }

    if (tipoLancamento === 'parcelado') {
      await salvarParcelado()
    }

    if (tipoLancamento === 'fixa_mensal') {
      await salvarFixaMensal()
    }

    agendarSync()
    onVoltar()
  }

  if (!usuarios || !categorias || !subcategorias || !cartoes || !lancamentos) {
    return (
      <div className="space-y-4 pb-24">
        <TopoTela titulo="Lançamento" subtitulo="Carregando formulário..." />
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
        titulo={tipo === 'receita' ? 'Nova receita' : metodoPagamento === 'cartao' ? 'Despesa no cartão' : 'Nova despesa'}
        subtitulo="Registre movimentações, parcelas e recorrências."
      />

      <CardPremium className="space-y-4">
        <FiltroSegmentado
          valor={tipoLancamento}
          onChange={setTipoLancamento}
          opcoes={[
            { valor: 'simples', label: 'Normal' },
            { valor: 'parcelado', label: 'Parcelado' },
            { valor: 'fixa_mensal', label: 'Fixa mensal' }
          ]}
        />

        <label className="block">
          <span className="mb-2 block text-xs font-semibold text-[#91A99C]">
            Usuário
          </span>

          <select
            value={usuarioSelecionado}
            onChange={(event) => setUsuarioId(event.target.value)}
            className="min-h-[48px] w-full rounded-2xl border border-[#1C2A24] bg-[#030504] px-4 py-3 text-sm text-[#F4FFF8] outline-none focus:border-[#3AF2A1]"
          >
            {usuarios.map((usuario) => (
              <option key={usuario.id} value={usuario.id}>
                {usuario.nome}
              </option>
            ))}
          </select>
        </label>

        <CampoDescricaoComSugestoes
          descricao={descricao}
          setDescricao={setDescricao}
          setMostrarSugestoes={setMostrarSugestoes}
          sugestoes={sugestoesFiltradas}
          onSelecionarSugestao={selecionarSugestao}
        />

        <CampoTexto
          label="Valor"
          value={valor}
          onChange={(novoValor) => setValor(formatarCampoMoeda(novoValor))}
          placeholder="R$ 0,00"
          type="text"
          inputMode="numeric"
        />

        {lancamentoCartao && (
          <>
            <SeletorCartao
              cartoes={cartoes}
              cartaoSelecionado={cartaoSelecionado}
              onSelecionar={atualizarCartao}
            />

            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-[#91A99C]">
                Fatura
              </span>

              <select
                value={faturaSelecionada}
                onChange={(event) => setFaturaRef(event.target.value)}
                className="min-h-[48px] w-full rounded-2xl border border-[#1C2A24] bg-[#030504] px-4 py-3 text-sm text-[#F4FFF8] outline-none focus:border-[#3AF2A1]"
              >
                {opcoesFatura.map((item) => (
                  <option key={item} value={item}>
                    {formatarFatura(item)}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {!lancamentoCartao && (
          <>
            <CampoTexto
              label="Competência"
              value={dataCompetencia}
              onChange={atualizarDataCompetencia}
              type="date"
            />

            <FiltroSegmentado
              valor={metodoPagamento}
              onChange={atualizarMetodo}
              opcoes={[
                { valor: 'pix', label: 'PIX' },
                { valor: 'dinheiro', label: 'Dinheiro' }
              ]}
            />
          </>
        )}

        <SeletorCategoria
          categorias={categoriasFiltradas}
          categoriaSelecionada={categoriaSelecionada}
          onSelecionar={(id) => {
            setCategoriaId(id)
            setSubcategoriaId('')
          }}
        />

        <label className="block">
          <span className="mb-2 block text-xs font-semibold text-[#91A99C]">
            Subcategoria
          </span>

          <select
            value={subcategoriaId}
            onChange={(event) => setSubcategoriaId(event.target.value)}
            disabled={!categoriaId}
            className="min-h-[48px] w-full rounded-2xl border border-[#1C2A24] bg-[#030504] px-4 py-3 text-sm text-[#F4FFF8] outline-none disabled:opacity-50 focus:border-[#3AF2A1]"
          >
            <option value="">
              {categoriaId ? 'Selecione a subcategoria' : 'Escolha uma categoria primeiro'}
            </option>

            {subcategoriasFiltradas.map((subcategoria) => (
              <option key={subcategoria.id} value={subcategoria.id}>
                {subcategoria.nome}
              </option>
            ))}
          </select>
        </label>

        {tipoLancamento === 'parcelado' && (
          <div className="grid grid-cols-2 gap-3">
            <CampoTexto
              label="Parcela atual"
              value={parcelaAtual}
              onChange={(valorCampo) => setParcelaAtual(String(valorCampo).replace(/\D/g, '').slice(0, 2))}
              placeholder="3"
              inputMode="numeric"
            />

            <CampoTexto
              label="Total"
              value={totalParcelas}
              onChange={(valorCampo) => setTotalParcelas(String(valorCampo).replace(/\D/g, '').slice(0, 2))}
              placeholder="6"
              inputMode="numeric"
            />
          </div>
        )}

        {mostrarStatus && (
          <FiltroSegmentado
            valor={status}
            onChange={setStatus}
            opcoes={[
              { valor: 'pendente', label: 'Pendente' },
              { valor: 'pago', label: 'Pago' }
            ]}
          />
        )}

        <label className="block">
          <span className="mb-2 block text-xs font-semibold text-[#91A99C]">
            Observações
          </span>

          <textarea
            value={observacoes}
            onChange={(event) => setObservacoes(event.target.value)}
            placeholder="Informações adicionais"
            className="min-h-[86px] w-full resize-none rounded-2xl border border-[#1C2A24] bg-[#030504] px-4 py-3 text-sm text-[#F4FFF8] outline-none placeholder:text-[#587367] focus:border-[#3AF2A1]"
          />
        </label>

        <Botao onClick={salvar}>
          <span className="inline-flex items-center justify-center gap-2">
            <Save size={18} />
            Salvar lançamento
          </span>
        </Botao>
      </CardPremium>
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
  return (
    <div className="relative">
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

function SeletorCartao({ cartoes, cartaoSelecionado, onSelecionar }) {
  const [aberto, setAberto] = useState(false)

  return (
    <div className="relative">
      <span className="mb-2 block text-xs font-semibold text-[#91A99C]">
        Cartão
      </span>

      <button
        type="button"
        onClick={() => setAberto((atual) => !atual)}
        className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-2xl border border-[#1C2A24] bg-[#030504] px-4 py-3 text-left text-sm text-[#F4FFF8] outline-none"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="h-4 w-4 shrink-0 rounded-full shadow-[0_0_14px_currentColor]"
            style={{
              backgroundColor: cartaoSelecionado?.cor || '#1C2A24',
              color: cartaoSelecionado?.cor || '#1C2A24'
            }}
          />

          <span className="truncate">
            {cartaoSelecionado
              ? `${cartaoSelecionado.nome} · ${cartaoSelecionado.bandeira}`
              : 'Selecione o cartão'}
          </span>
        </div>

        <ChevronDown
          size={18}
          className={`shrink-0 text-[#91A99C] transition ${aberto ? 'rotate-180' : ''}`}
        />
      </button>

      {aberto && (
        <div className="absolute left-0 right-0 top-[76px] z-50 max-h-64 overflow-y-auto rounded-3xl border border-[#1C2A24] bg-[#07100B] p-2 shadow-2xl">
          {cartoes.map((cartao) => (
            <button
              key={cartao.id}
              type="button"
              onClick={() => {
                onSelecionar(String(cartao.id))
                setAberto(false)
              }}
              className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-[#3AF2A1]/5 active:scale-[0.99]"
            >
              <span
                className="h-5 w-5 shrink-0 rounded-full shadow-[0_0_16px_currentColor]"
                style={{
                  backgroundColor: cartao.cor || '#0F9D58',
                  color: cartao.cor || '#0F9D58'
                }}
              />

              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[#F4FFF8]">
                  {cartao.nome}
                </p>
                <p className="mt-0.5 text-xs text-[#91A99C]">
                  {cartao.bandeira}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SeletorCategoria({ categorias, categoriaSelecionada, onSelecionar }) {
  const [aberto, setAberto] = useState(false)

  return (
    <div className="relative">
      <span className="mb-2 block text-xs font-semibold text-[#91A99C]">
        Categoria
      </span>

      <button
        type="button"
        onClick={() => setAberto((atual) => !atual)}
        className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-2xl border border-[#1C2A24] bg-[#030504] px-4 py-3 text-left text-sm text-[#F4FFF8] outline-none"
      >
        <div className="flex min-w-0 items-center gap-3">
          {categoriaSelecionada ? (
            <IconeCategoria
              icone={categoriaSelecionada.icone}
              cor={categoriaSelecionada.cor}
              tamanho="sm"
              ativo
            />
          ) : (
            <span className="h-10 w-10 shrink-0 rounded-2xl border border-[#1C2A24] bg-[#030504]" />
          )}

          <span className="truncate">
            {categoriaSelecionada ? categoriaSelecionada.nome : 'Selecione a categoria'}
          </span>
        </div>

        <ChevronDown
          size={18}
          className={`shrink-0 text-[#91A99C] transition ${aberto ? 'rotate-180' : ''}`}
        />
      </button>

      {aberto && (
        <div className="absolute left-0 right-0 top-[76px] z-50 max-h-72 overflow-y-auto rounded-3xl border border-[#1C2A24] bg-[#07100B] p-2 shadow-2xl">
          {categorias.map((categoria) => (
            <button
              key={categoria.id}
              type="button"
              onClick={() => {
                onSelecionar(String(categoria.id))
                setAberto(false)
              }}
              className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-[#3AF2A1]/5 active:scale-[0.99]"
            >
              <IconeCategoria
                icone={categoria.icone}
                cor={categoria.cor}
                tamanho="sm"
                ativo={categoriaSelecionada?.id === categoria.id}
              />

              <span className="truncate text-sm font-black text-[#F4FFF8]">
                {categoria.nome}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}