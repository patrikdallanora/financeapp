import { useState } from 'react'
import { executarSync } from '../sync/syncManager'

export default function Configuracoes() {
  const [status, setStatus] = useState('Aguardando sincronização...')

  const sincronizarPendentes = async () => {
    try {
      setStatus('Sincronizando pendentes...')
      const resultado = await executarSync()
      setStatus(JSON.stringify(resultado, null, 2))
    } catch (err) {
      setStatus(`Erro: ${err.message}`)
    }
  }

  const reenviarTudo = async () => {
    try {
      setStatus('Reenviando todos os dados locais para o Google Sheets...')
      const resultado = await executarSync({ forcarTudo: true })
      setStatus(JSON.stringify(resultado, null, 2))
    } catch (err) {
      setStatus(`Erro: ${err.message}`)
    }
  }

  return (
    <div className="space-y-4 pb-16">
      <h1 className="text-xl">Configurações</h1>

      <button
        onClick={sincronizarPendentes}
        className="w-full rounded bg-blue-500 p-3"
      >
        Forçar sincronização
      </button>

      <button
        onClick={reenviarTudo}
        className="w-full rounded bg-green-600 p-3"
      >
        Reenviar tudo para o Sheets
      </button>

      <div className="rounded bg-gray-900 p-3 text-sm">
        <p className="mb-2 text-gray-400">Status:</p>
        <pre className="whitespace-pre-wrap break-words text-xs text-white">
          {status}
        </pre>
      </div>

      <p className="break-words text-sm text-gray-400">
        URL Sheets: {import.meta.env.VITE_SHEETS_API_URL || 'não configurada'}
      </p>
    </div>
  )
}