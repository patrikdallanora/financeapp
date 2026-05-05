import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, criarRegistroBase } from '../db/database'

export default function Categorias() {
  const [nome, setNome] = useState('')

  const categorias = useLiveQuery(async () => {
    const all = await db.categorias.toArray()
    return all.filter(c => !c.deletedAt)
  }, [])

  const criar = async () => {
    if (!nome) return

    await db.categorias.add({
      ...criarRegistroBase(),
      nome,
      icone: '📦',
      cor: '#888',
      tipo: 'ambos'
    })

    setNome('')
  }

  return (
    <div className="space-y-4 pb-16">
      <h1 className="text-xl">Categorias</h1>

      <div className="bg-gray-900 p-4">
        <input
          value={nome}
          onChange={e => setNome(e.target.value)}
          className="w-full p-2 bg-black border"
          placeholder="Nova categoria"
        />
        <button onClick={criar} className="mt-2 bg-blue-500 w-full p-2">
          Criar
        </button>
      </div>

      {categorias?.map(c => (
        <div key={c.id} className="bg-gray-900 p-3">
          {c.icone} {c.nome}
        </div>
      ))}
    </div>
  )
}