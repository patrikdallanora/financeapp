import { useState, useEffect } from 'react'

const SESSION_KEY = 'financeapp_session'
const SESSION_DURATION = 1000 * 60 * 60 * 8 // 8h

export function useAuth() {
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const verificarSessao = () => {
      const data = localStorage.getItem(SESSION_KEY)
      if (!data) return false

      const { timestamp } = JSON.parse(data)
      const agora = Date.now()

      return agora - timestamp < SESSION_DURATION
    }

    if (verificarSessao()) {
      setAuthenticated(true)
    }

    setLoading(false)
  }, [])

  const salvarSessao = () => {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ timestamp: Date.now() })
    )
  }

  const autenticarBiometria = async () => {
    try {
      if (!window.PublicKeyCredential) {
        return false
      }

      await navigator.credentials.get({
        publicKey: {
          challenge: new Uint8Array(32),
          timeout: 60000,
          userVerification: 'preferred'
        }
      })

      salvarSessao()
      setAuthenticated(true)
      return true
    } catch (err) {
      console.warn('Biometria falhou:', err)
      return false
    }
  }

  const autenticarPIN = (pin) => {
    const PIN_PADRAO = '1234'

    if (pin === PIN_PADRAO) {
      salvarSessao()
      setAuthenticated(true)
      return true
    }

    return false
  }

  const logout = () => {
    localStorage.removeItem(SESSION_KEY)
    setAuthenticated(false)
  }

  return {
    authenticated,
    loading,
    autenticarBiometria,
    autenticarPIN,
    logout
  }
}