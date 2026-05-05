import { useEffect, useState } from 'react'
import { initDB } from '../db/database'

export function useDbReady() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true

    const iniciar = async () => {
      try {
        await initDB()
        if (mounted) setReady(true)
      } catch (err) {
        console.error('Erro ao iniciar DB:', err)
        if (mounted) setError(err)
      }
    }

    iniciar()

    return () => {
      mounted = false
    }
  }, [])

  return { ready, error }
}