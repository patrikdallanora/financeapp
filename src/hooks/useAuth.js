import { useEffect, useState } from 'react'

const SESSION_KEY = 'financeapp_session'
const CREDENTIAL_KEY = 'financeapp_credential_id'
const SESSION_DURATION = 1000 * 60 * 60 * 8
const PIN_PADRAO = '1234'

const gerarChallenge = () => {
  const challenge = new Uint8Array(32)
  crypto.getRandomValues(challenge)
  return challenge
}

const bufferParaBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer)
  let texto = ''

  bytes.forEach((byte) => {
    texto += String.fromCharCode(byte)
  })

  return btoa(texto)
}

const base64ParaBuffer = (base64) => {
  const texto = atob(base64)
  const bytes = new Uint8Array(texto.length)

  for (let i = 0; i < texto.length; i++) {
    bytes[i] = texto.charCodeAt(i)
  }

  return bytes.buffer
}

export function useAuth() {
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)
  const [biometriaDisponivel, setBiometriaDisponivel] = useState(false)

  useEffect(() => {
    const iniciar = async () => {
      const sessaoValida = verificarSessao()

      if (sessaoValida) {
        setAuthenticated(true)
      }

      const suporte = await verificarBiometriaDisponivel()
      setBiometriaDisponivel(suporte)

      setLoading(false)
    }

    iniciar()
  }, [])

  const verificarSessao = () => {
    const data = localStorage.getItem(SESSION_KEY)

    if (!data) return false

    try {
      const { timestamp } = JSON.parse(data)
      return Date.now() - timestamp < SESSION_DURATION
    } catch {
      return false
    }
  }

  const salvarSessao = () => {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ timestamp: Date.now() })
    )
  }

  const verificarBiometriaDisponivel = async () => {
    try {
      if (!window.PublicKeyCredential || !navigator.credentials) {
        return false
      }

      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    } catch {
      return false
    }
  }

  const cadastrarCredencialLocal = async () => {
    const userId = new Uint8Array(16)
    crypto.getRandomValues(userId)

    const credencial = await navigator.credentials.create({
      publicKey: {
        challenge: gerarChallenge(),
        rp: {
          name: 'FinanceApp'
        },
        user: {
          id: userId,
          name: 'financeapp-user',
          displayName: 'FinanceApp'
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 }
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required'
        },
        timeout: 60000,
        attestation: 'none'
      }
    })

    if (!credencial) {
      throw new Error('Não foi possível cadastrar a biometria.')
    }

    localStorage.setItem(CREDENTIAL_KEY, bufferParaBase64(credencial.rawId))

    return credencial
  }

  const autenticarBiometria = async () => {
    setAuthError(null)

    try {
      const suporte = await verificarBiometriaDisponivel()

      if (!suporte) {
        setAuthError('Biometria indisponível neste dispositivo.')
        return false
      }

      let credentialId = localStorage.getItem(CREDENTIAL_KEY)

      if (!credentialId) {
        await cadastrarCredencialLocal()
        credentialId = localStorage.getItem(CREDENTIAL_KEY)
      }

      await navigator.credentials.get({
        publicKey: {
          challenge: gerarChallenge(),
          allowCredentials: [
            {
              id: base64ParaBuffer(credentialId),
              type: 'public-key'
            }
          ],
          timeout: 60000,
          userVerification: 'required'
        }
      })

      salvarSessao()
      setAuthenticated(true)
      return true
    } catch (err) {
      console.warn('Falha na autenticação biométrica:', err)
      setAuthError('Não foi possível autenticar pelo dispositivo.')
      return false
    }
  }

  const autenticarPIN = (pin) => {
    setAuthError(null)

    if (pin === PIN_PADRAO) {
      salvarSessao()
      setAuthenticated(true)
      return true
    }

    setAuthError('PIN inválido.')
    return false
  }

  const logout = () => {
    localStorage.removeItem(SESSION_KEY)
    setAuthenticated(false)
  }

  return {
    authenticated,
    loading,
    authError,
    biometriaDisponivel,
    verificarSessao,
    autenticarBiometria,
    autenticarPIN,
    logout
  }
}