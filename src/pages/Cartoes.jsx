import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ChevronDown,
  CreditCard,
  Edit3,
  Eye,
  Plus,
  RotateCcw,
  Trash2,
  XCircle
} from 'lucide-react'

import { db, criarRegistroBase, softDelete, agoraISO } from '../db/database'
import { Botao } from '../components/Botao'
import { CampoTexto } from '../components/CampoTexto'
import { CardPremium } from '../components/CardPremium'
import { TopoTela } from '../components/TopoTela'

const CORES_CARTAO = [
  '#0F9D58',
  '#3AF2A1',
  '#15803D',
  '#84CC16',
  '#14B8A6',
  '#06B6D4',
  '#0EA5E9',
  '#3B82F6',
  '#6366F1',
  '#8B5CF6',
  '#A855F7',
  '#D946EF',
  '#EC4899',
  '#F43F5E',
  '#EF4444',
  '#F97316',
  '#F59E0B',
  '#FFF085',
  '#A65F1B',
  '#64748B',
  '#475569',
  '#334155'
]

const BANDEIRAS = [
  'Visa',
  'Mastercard',
  'Elo',
  'American Express',
  'Hipercard',
  'Outra'
]

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

const normalizarDiaMes = (valor) => {
  const apenasNumeros = String(valor || '').replace(/\D/g, '').slice(0, 2)

  if (!apenasNumeros) return ''

  const numero = Number(apenasNumeros)

  if (numero > 31) return '31'

  return apenasNumeros
}

const obterMesAtual = () => {
  return new Date().toISOString().slice(0, 7)
}

export default function Cartoes() {
  const [modoFormulario, setModoFormulario] = useState(false)
  const [cartaoEditando, setCartaoEditando] = useState(null)
  const [cartaoExpandidoId, setCartaoExpandidoId] = useState(null)

  const cartoes = useLiveQuery(async () => {
    const todos = await db.cartoes.toArray()
    return todos.filter((cartao) => !cartao.deletedAt)
  }, [])

  const lancamentos = useLiveQuery(async () => {
    const todos = await db.lancamentos.toArray()
    return todos.filter((lancamento) => !lancamento.deletedAt)
  }, [])

  const dadosCartoes = useMemo(() => {
    if (!cartoes || !lancamentos) return []

    const faturaAtual = obterMesAtual()

    return cartoes.map((cartao) => {
      const lancamentosDoCartao = lancamentos.filter(
        (lancamento) => lancamento.cartaoId === cartao.id
      )

      const limiteUsado = lancamentosDoCartao
        .filter((lancamento) => lancamento.status === 'pendente')
        .reduce((total, lancamento) => total + Number(lancamento.valor || 0), 0)

      const limiteTotal = Number(cartao.limite || 0)
      const limiteDisponivel = Math.max(limiteTotal - limiteUsado, 0)
      const percentualUso =
        limiteTotal > 0 ? Math.min((limiteUsado / limiteTotal) * 100, 100) : 0

      const lancamentosFaturaAtual = lancamentosDoCartao.filter(
        (lancamento) => lancamento.faturaRef === faturaAtual
      )

      const totalFaturaAtual = lancamentosFaturaAtual.reduce(
        (total, lancamento) => total + Number(lancamento.valor || 0),
        0
      )

      return {
        ...cartao,
        limiteTotal,
        limiteUsado,
        limiteDisponivel,
        percentualUso,
        faturaAtual,
        totalFaturaAtual,
        quantidadeLancamentosFatura: lancamentosFaturaAtual.length
      }
    })
  }, [cartoes, lancamentos])

  const resumo = useMemo(() => {
    const limiteTotal = dadosCartoes.reduce(
      (total, cartao) => total + cartao.limiteTotal,
      0
    )

    const limiteUsado = dadosCartoes.reduce(
      (total, cartao) => total + cartao.limiteUsado,
      0
    )

    const limiteDisponivel = Math.max(limiteTotal - limiteUsado, 0)

    return {
      limiteTotal,
      limiteUsado,
      limiteDisponivel,
      percentualUso:
        limiteTotal > 0 ? Math.min((limiteUsado / limiteTotal) * 100, 100) : 0
    }
  }, [dadosCartoes])

  const iniciarNovoCartao = () => {
    setCartaoEditando(null)
    setModoFormulario((atual) => !atual)
  }

  const iniciarEdicao = (cartao) => {
    setCartaoEditando(cartao)
    setModoFormulario(true)
  }

  const concluirFormulario = () => {
    setCartaoEditando(null)
    setModoFormulario(false)
  }

  const alternarExpansao = (cartaoId) => {
    setCartaoExpandidoId((atual) => (atual === cartaoId ? null : cartaoId))
  }

  if (!cartoes || !lancamentos) {
    return (
      <div className="space-y-4 pb-24">
        <TopoTela
          titulo="Cartões"
          subtitulo="Carregando seus cartões..."
        />
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-24">
      <TopoTela
        titulo="Cartões"
        subtitulo="Gerencie limites, faturas e vencimentos em uma central premium."
        acao={
          <button
            onClick={iniciarNovoCartao}
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3AF2A1] via-[#0F9D58] to-[#021A10] text-white glow-verde active:scale-95"
          >
            <Plus size={22} />
          </button>
        }
      />

      <ResumoCartoes resumo={resumo} quantidade={dadosCartoes.length} />

      {modoFormulario && (
        <FormularioCartao
          cartao={cartaoEditando}
          onCancelar={concluirFormulario}
          onSalvo={concluirFormulario}
        />
      )}

      <section className="space-y-3">
        {dadosCartoes.length === 0 && (
          <CardPremium>
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#1C2A24] bg-[#030504] text-[#3AF2A1]">
                <CreditCard size={22} />
              </div>

              <div>
                <p className="font-black text-[#F4FFF8]">
                  Nenhum cartão cadastrado
                </p>
                <p className="mt-1 text-sm leading-5 text-[#91A99C]">
                  Cadastre seu primeiro cartão para acompanhar limite, fatura e vencimento.
                </p>
              </div>
            </div>
          </CardPremium>
        )}

        {dadosCartoes.map((cartao) => (
          <CartaoCreditoVisual
            key={cartao.id}
            cartao={cartao}
            expandido={cartaoExpandidoId === cartao.id}
            onAlternarExpansao={() => alternarExpansao(cartao.id)}
            onEditar={() => iniciarEdicao(cartao)}
          />
        ))}
      </section>
    </div>
  )
}

function ResumoCartoes({ resumo, quantidade }) {
  return (
    <CardPremium className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#3AF2A1]">
            Central de cartões
          </p>

          <h2 className="mt-1 text-2xl font-black text-[#F4FFF8]">
            {formatarMoeda(resumo.limiteDisponivel)}
          </h2>

          <p className="mt-1 text-sm text-[#91A99C]">
            disponível em {quantidade} {quantidade === 1 ? 'cartão' : 'cartões'}
          </p>
        </div>

        <div className="flex h-14 w-14 items-center justify-center rounded-3xl border border-[#3AF2A1]/30 bg-[#030504] text-[#3AF2A1] shadow-[0_0_28px_rgba(58,242,161,0.18)]">
          <CreditCard size={26} />
        </div>
      </div>

      <div>
        <div className="mb-2 flex justify-between text-xs">
          <span className="text-[#91A99C]">Uso total</span>
          <span className="font-black text-[#F4FFF8]">
            {resumo.percentualUso.toFixed(0)}%
          </span>
        </div>

        <div className="h-3 overflow-hidden rounded-full bg-[#030504]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#3AF2A1] via-[#0F9D58] to-[#021A10]"
            style={{ width: `${resumo.percentualUso}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MiniResumo titulo="Limite" valor={resumo.limiteTotal} />
        <MiniResumo titulo="Usado" valor={resumo.limiteUsado} />
        <MiniResumo titulo="Livre" valor={resumo.limiteDisponivel} />
      </div>
    </CardPremium>
  )
}

function MiniResumo({ titulo, valor }) {
  return (
    <div className="rounded-2xl border border-[#1C2A24] bg-[#030504]/70 p-3">
      <p className="text-[11px] font-semibold text-[#91A99C]">{titulo}</p>
      <p className="mt-1 truncate text-xs font-black text-[#F4FFF8]">
        {formatarMoeda(valor)}
      </p>
    </div>
  )
}

function CartaoCreditoVisual({
  cartao,
  expandido,
  onAlternarExpansao,
  onEditar
}) {
  const alternarStatus = async () => {
    await db.cartoes.update(cartao.id, {
      ativo: !cartao.ativo,
      updatedAt: agoraISO(),
      syncStatus: 'pending'
    })
  }

  const excluir = async () => {
    const confirmar = confirm(`Excluir o cartão "${cartao.nome}"?`)

    if (!confirmar) return

    await softDelete('cartoes', cartao.id)
  }

  return (
    <CardPremium className="overflow-hidden p-0">
      <button
        onClick={onAlternarExpansao}
        className="relative w-full overflow-hidden rounded-[28px] border p-4 text-left transition active:scale-[0.99]"
        style={{
          borderColor: `${cartao.cor || '#0F9D58'}55`,
          background: `
            radial-gradient(circle at top right, ${cartao.cor || '#0F9D58'}44, transparent 36%),
            linear-gradient(145deg, #030504 0%, ${cartao.cor || '#0F9D58'}24 100%)
          `
        }}
      >
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/5 blur-2xl" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#91A99C]">
              {cartao.bandeira || 'Cartão'}
            </p>

            <h3 className="mt-2 truncate text-xl font-black text-[#F4FFF8]">
              {cartao.nome}
            </h3>

            <p className="mt-4 text-xs font-semibold text-[#91A99C]">
              Fatura atual
            </p>

            <p className="mt-1 text-2xl font-black text-[#F4FFF8]">
              {formatarMoeda(cartao.totalFaturaAtual)}
            </p>

            <p className="mt-2 text-sm font-semibold text-[#91A99C]">
              Vencimento dia {String(cartao.diaVencimento || '-').padStart(2, '0')}
            </p>
          </div>

          <div className="flex flex-col items-end gap-3">
            <span
              className={`
                rounded-full px-3 py-1 text-[11px] font-black
                ${
                  cartao.ativo
                    ? 'bg-[#3AF2A1]/12 text-[#3AF2A1]'
                    : 'bg-red-950/50 text-red-300'
                }
              `}
            >
              {cartao.ativo ? 'Ativo' : 'Inativo'}
            </span>

            <div
              className={`
                flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-[#F4FFF8]
                transition-transform duration-300
                ${expandido ? 'rotate-180' : 'rotate-0'}
              `}
            >
              <ChevronDown size={18} />
            </div>
          </div>
        </div>
      </button>

      <div
        className={`
          grid transition-all duration-300 ease-out
          ${expandido ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}
        `}
      >
        <div className="overflow-hidden">
          <div className="space-y-4 p-4 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <InfoCartao
                label="Fechamento"
                value={`Dia ${String(cartao.diaFechamento || '-').padStart(2, '0')}`}
              />
              <InfoCartao
                label="Vencimento"
                value={`Dia ${String(cartao.diaVencimento || '-').padStart(2, '0')}`}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-[#91A99C]">Limite usado</span>
                <span className="font-black text-[#F4FFF8]">
                  {cartao.percentualUso.toFixed(0)}%
                </span>
              </div>

              <div className="h-3 overflow-hidden rounded-full bg-[#030504]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${cartao.percentualUso}%`,
                    background: `linear-gradient(90deg, ${cartao.cor || '#0F9D58'}, #3AF2A1)`
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <MiniResumo titulo="Limite" valor={cartao.limiteTotal} />
              <MiniResumo titulo="Usado" valor={cartao.limiteUsado} />
              <MiniResumo titulo="Livre" valor={cartao.limiteDisponivel} />
            </div>

            <div className="rounded-3xl border border-[#1C2A24] bg-[#030504]/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[#91A99C]">
                    Fatura atual · {cartao.faturaAtual}
                  </p>
                  <p className="mt-1 text-lg font-black text-[#F4FFF8]">
                    {formatarMoeda(cartao.totalFaturaAtual)}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs text-[#91A99C]">
                    {cartao.quantidadeLancamentosFatura}
                  </p>
                  <p className="text-[11px] text-[#587367]">lançamentos</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-[#1C2A24] bg-[#030504] text-xs font-black text-[#3AF2A1] active:scale-[0.98]">
                <Eye size={15} />
                Fatura
              </button>

              <button
                onClick={onEditar}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-[#1C2A24] bg-[#030504] text-xs font-black text-[#91A99C] active:scale-[0.98]"
              >
                <Edit3 size={15} />
                Editar
              </button>

              <button
                onClick={alternarStatus}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-[#1C2A24] bg-[#030504] text-xs font-black text-[#91A99C] active:scale-[0.98]"
              >
                {cartao.ativo ? <XCircle size={15} /> : <RotateCcw size={15} />}
                {cartao.ativo ? 'Inativar' : 'Ativar'}
              </button>
            </div>

            <button
              onClick={excluir}
              className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-2xl border border-red-900/60 bg-red-950/30 text-xs font-black text-red-300 active:scale-[0.98]"
            >
              <Trash2 size={15} />
              Excluir cartão
            </button>
          </div>
        </div>
      </div>
    </CardPremium>
  )
}

function InfoCartao({ label, value }) {
  return (
    <div className="rounded-2xl border border-[#1C2A24] bg-[#030504]/70 p-3">
      <p className="text-[11px] font-semibold text-[#91A99C]">{label}</p>
      <p className="mt-1 text-sm font-black text-[#F4FFF8]">{value}</p>
    </div>
  )
}

function FormularioCartao({ cartao, onCancelar, onSalvo }) {
  const [nome, setNome] = useState(cartao?.nome || '')
  const [bandeira, setBandeira] = useState(cartao?.bandeira || 'Visa')
  const [limite, setLimite] = useState(
    cartao?.limite
      ? formatarCampoMoeda(String(Math.round(Number(cartao.limite) * 100)))
      : ''
  )
  const [diaFechamento, setDiaFechamento] = useState(
    cartao?.diaFechamento ? String(cartao.diaFechamento).padStart(2, '0') : ''
  )
  const [diaVencimento, setDiaVencimento] = useState(
    cartao?.diaVencimento ? String(cartao.diaVencimento).padStart(2, '0') : ''
  )
  const [cor, setCor] = useState(cartao?.cor || '#0F9D58')

  const salvar = async () => {
    if (!nome.trim()) {
      alert('Informe o nome do cartão.')
      return
    }

    const limiteNumerico = moedaParaNumero(limite)

    if (!limiteNumerico || limiteNumerico <= 0) {
      alert('Informe um limite válido.')
      return
    }

    if (!diaFechamento || Number(diaFechamento) < 1 || Number(diaFechamento) > 31) {
      alert('Informe um dia de fechamento entre 1 e 31.')
      return
    }

    if (!diaVencimento || Number(diaVencimento) < 1 || Number(diaVencimento) > 31) {
      alert('Informe um dia de vencimento entre 1 e 31.')
      return
    }

    const dados = {
      nome: nome.trim(),
      bandeira,
      limite: limiteNumerico,
      diaFechamento: Number(diaFechamento),
      diaVencimento: Number(diaVencimento),
      cor,
      ativo: cartao?.ativo ?? true,
      updatedAt: agoraISO(),
      syncStatus: 'pending'
    }

    if (cartao) {
      await db.cartoes.update(cartao.id, dados)
      onSalvo()
      return
    }

    await db.cartoes.add({
      ...criarRegistroBase(),
      ...dados
    })

    onSalvo()
  }

  return (
    <CardPremium className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-[#F4FFF8]">
          {cartao ? 'Editar cartão' : 'Novo cartão'}
        </h2>
        <p className="text-sm text-[#91A99C]">
          Cadastro rápido para controlar limite, fatura e vencimento.
        </p>
      </div>

      <CampoTexto
        label="Nome do cartão"
        value={nome}
        onChange={setNome}
        placeholder="Ex: Nubank, Inter, Itaú"
      />

      <label className="block">
        <span className="mb-2 block text-xs font-semibold text-[#91A99C]">
          Bandeira
        </span>

        <select
          value={bandeira}
          onChange={(event) => setBandeira(event.target.value)}
          className="min-h-[48px] w-full rounded-2xl border border-[#1C2A24] bg-[#030504] px-4 py-3 text-sm text-[#F4FFF8] outline-none focus:border-[#3AF2A1]"
        >
          {BANDEIRAS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      <CampoTexto
        label="Limite total"
        value={limite}
        onChange={(valor) => setLimite(formatarCampoMoeda(valor))}
        placeholder="R$ 0,00"
        type="text"
        inputMode="numeric"
      />

      <div className="grid grid-cols-2 gap-3">
        <CampoTexto
          label="Fechamento"
          value={diaFechamento}
          onChange={(valor) => setDiaFechamento(normalizarDiaMes(valor))}
          placeholder="05"
          type="text"
          inputMode="numeric"
        />

        <CampoTexto
          label="Vencimento"
          value={diaVencimento}
          onChange={(valor) => setDiaVencimento(normalizarDiaMes(valor))}
          placeholder="10"
          type="text"
          inputMode="numeric"
        />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-[#91A99C]">Cor</p>

        <div className="max-h-[154px] overflow-y-auto rounded-3xl border border-[#1C2A24] bg-[#030504]/55 p-2">
          <div className="grid grid-cols-5 gap-2">
            {CORES_CARTAO.map((item) => (
              <button
                key={item}
                onClick={() => setCor(item)}
                className={`
                  h-11 rounded-2xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]
                  ${cor === item ? 'border-white' : 'border-[#1C2A24]'}
                `}
                style={{ backgroundColor: item }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Botao variante="fantasma" onClick={onCancelar}>
          Cancelar
        </Botao>

        <Botao onClick={salvar}>
          Salvar
        </Botao>
      </div>
    </CardPremium>
  )
}