import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDown, ArrowUp, CreditCard, Plus, X } from 'lucide-react'
import { db } from '../db/database'

const formatarMoeda = (valor) => {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
}

const obterMesAtual = () => new Date().toISOString().slice(0, 7)

export default function Dashboard({ onNovoLancamento, onAbrirExtratos }) {
  const [menuAberto, setMenuAberto] = useState(false)
  const mesAtual = obterMesAtual()

  const lancamentos = useLiveQuery(async () => {
    const todos = await db.lancamentos.toArray()
    return todos.filter((lancamento) => !lancamento.deletedAt)
  }, [])

  const doMes = (lancamentos || []).filter((lancamento) =>
    lancamento.dataCompetencia?.startsWith(mesAtual)
  )

  const totalReceitas = doMes
    .filter((lancamento) => lancamento.tipo === 'receita')
    .reduce((total, lancamento) => total + Number(lancamento.valor || 0), 0)

  const totalDespesas = doMes
    .filter((lancamento) => lancamento.tipo === 'despesa')
    .reduce((total, lancamento) => total + Number(lancamento.valor || 0), 0)

  const saldo = totalReceitas - totalDespesas

  const escolherLancamento = (config) => {
    setMenuAberto(false)
    onNovoLancamento(config)
  }

  return (
    <div className="relative space-y-4 pb-24">
      <header className="mb-5">
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

      <div className="grid gap-3">
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
        card-premium w-full rounded-[28px] p-4 text-left
        ${onClick ? 'transition active:scale-[0.99]' : ''}
      `}
    >
      <p className="text-xs font-semibold text-[#91A99C]">{titulo}</p>

      <p
        className={`mt-2 text-2xl font-black ${
          positivo ? 'text-[#3AF2A1]' : 'text-red-300'
        }`}
      >
        {formatarMoeda(valor)}
      </p>
    </Component>
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