import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'

export function ConflictBanner() {
  const conflitos = useLiveQuery(async () => {
    return await db.syncLog.where('resolved').equals(0).toArray()
  }, [])

  if (!conflitos || conflitos.length === 0) return null

  return (
    <div className="bg-yellow-600 text-black p-2 text-center text-sm">
      ⚠️ Existem conflitos de sincronização ({conflitos.length})
    </div>
  )
}