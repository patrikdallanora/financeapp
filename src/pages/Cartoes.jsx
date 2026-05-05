import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'

export default function Cartoes() {
  const cartoes = useLiveQuery(async () => {
    const todos = await db.cartoes.toArray()
    return todos.filter((cartao) => !cartao.deletedAt)
  }, [])

  if (!cartoes) {
    return (
      <div className="space-y-4 pb-16">
        <h1 className="text-xl">Cartões</h1>
        <p className="text-gray-400">Carregando cartões...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-16">
      <h1 className="text-xl">Cartões</h1>

      {cartoes.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
          <p className="text-gray-400">Nenhum cartão cadastrado ainda.</p>
        </div>
      ) : (
        cartoes.map((cartao) => (
          <div
            key={cartao.id}
            className="rounded-xl border border-gray-800 bg-gray-950 p-4"
          >
            <p className="font-semibold">{cartao.nome}</p>
            <p className="text-sm text-gray-400">
              Bandeira: {cartao.bandeira || 'Não informada'}
            </p>
            <p className="text-sm text-gray-400">
              Limite: R$ {Number(cartao.limite || 0).toFixed(2)}
            </p>
          </div>
        ))
      )}
    </div>
  )
}