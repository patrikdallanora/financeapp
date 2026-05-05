import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { format } from 'date-fns'

export default function Dashboard() {
  const hoje = new Date()
  const mesAtual = format(hoje, 'yyyy-MM')

  const lancamentos = useLiveQuery(async () => {
    return await db.lancamentos.toArray()
  }, [])

  if (!lancamentos) return null

  const doMes = lancamentos.filter(l =>
    l.dataCompetencia?.startsWith(mesAtual) && !l.deletedAt
  )

  const totalReceitas = doMes
    .filter(l => l.tipo === 'receita')
    .reduce((acc, l) => acc + l.valor, 0)

  const totalDespesas = doMes
    .filter(l => l.tipo === 'despesa')
    .reduce((acc, l) => acc + l.valor, 0)

  const saldo = totalReceitas - totalDespesas

  return (
    <div className="space-y-4">
      <h1 className="text-xl">Dashboard</h1>

      <div className="grid grid-cols-1 gap-3">
        <Card titulo="Receitas" valor={totalReceitas} cor="text-green-400" />
        <Card titulo="Despesas" valor={totalDespesas} cor="text-red-400" />
        <Card titulo="Saldo" valor={saldo} cor="text-blue-400" />
      </div>
    </div>
  )
}

function Card({ titulo, valor, cor }) {
  return (
    <div className="bg-gray-900 p-4 rounded-lg">
      <p className="text-sm text-gray-400">{titulo}</p>
      <p className={`text-lg ${cor}`}>
        R$ {valor.toFixed(2)}
      </p>
    </div>
  )
}