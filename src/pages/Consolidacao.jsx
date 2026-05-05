import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'

export default function Consolidacao() {
  const lancamentos = useLiveQuery(async () => {
    return await db.lancamentos
      .reverse()
      .sortBy('dataCompetencia')
  }, [])

  if (!lancamentos) return null

  return (
    <div className="space-y-4 pb-16">
      <h1 className="text-xl">Extrato</h1>

      {lancamentos.map(l => (
        <div
          key={l.id}
          className="bg-gray-900 p-3 rounded-lg flex justify-between"
        >
          <div>
            <p>{l.descricao}</p>
            <p className="text-xs text-gray-400">
              {l.dataCompetencia}
            </p>
          </div>

          <p className={l.tipo === 'receita' ? 'text-green-400' : 'text-red-400'}>
            R$ {l.valor.toFixed(2)}
          </p>
        </div>
      ))}
    </div>
  )
}