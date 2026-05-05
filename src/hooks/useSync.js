import { useState } from 'react'

export function useSync() {
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState(null)
  const [error, setError] = useState(null)

  const iniciarSync = async (fn) => {
    setSyncing(true)
    setError(null)

    try {
      await fn()
      setLastSync(new Date().toISOString())
    } catch (err) {
      console.error('Erro no sync:', err)
      setError(err)
    } finally {
      setSyncing(false)
    }
  }

  return {
    syncing,
    lastSync,
    error,
    iniciarSync
  }
}