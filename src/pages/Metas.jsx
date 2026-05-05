import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, criarRegistroBase } from '../db/database'

export default function Metas() {
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')

  const metas = useLiveQuery(async () => {
    const all = await db.metas.toArray()
    return all.filter(m => !m.deletedAt)
  }, [])

  const criarMeta = async () => {
    if (!descricao || !valor) return

    await db.metas.add({
      ...criarRegistroBase(),
      tipo: 'limite',
      descricao,
      valor: Number(valor),
      categoriaId: null,
      dataInicio: new Date().toISOString().slice(0, 10),
      dataFim: null,
      ativo: true
    })

    setDescricao('')
    setValor('')
  }

  return (
    <div className="space-y-4 pb-16">
      <h1 className="text-xl">Metas</h1>

      <div className="bg-gray-900 p-4 rounded">
        <input
          placeholder="Descrição"
          value={descricao}
          onChange={e => setDescricao(e.target.value)}
          className="w-full mb-2 p-2 bg-black border"
        />
        <input
          placeholder="Valor"
          type="number"
          value={valor}
          onChange={e => setValor(e.target.value)}
          className="w-full mb-2 p-2 bg-black border"
        />
        <button onClick={criarMeta} className="bg-blue-500 p-2 w-full">
          Criar meta
        </button>
      </div>

      {metas?.map(m => (
        <div key={m.id} className="bg-gray-900 p-3 rounded">
          <p>{m.descricao}</p>
          <p>R$ {m.valor.toFixed(2)}</p>
        </div>
      ))}
    </div>
  )
}