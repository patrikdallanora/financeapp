import { useState } from 'react'
import { useDbReady } from './hooks/useDbReady'
import { useAuth } from './hooks/useAuth'

import Dashboard from './pages/Dashboard'
import Consolidacao from './pages/Consolidacao'
import Cartoes from './pages/Cartoes'

import { BottomNav } from './components/BottomNav'
import { ConflictBanner } from './components/ConflictBanner'

import Metas from './pages/Metas'
import Categorias from './pages/Categorias'
import Configuracoes from './pages/Configuracoes'
import Relatorios from './pages/Relatorios'

function App() {
  const { ready, error } = useDbReady()
  const { authenticated, loading, autenticarBiometria, autenticarPIN } = useAuth()

  const [page, setPage] = useState('dashboard')
  const [pin, setPin] = useState('')

  if (loading || !ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        Carregando...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-red-400">
        Erro ao iniciar o banco local.
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black px-6 text-white">
        <div className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-950 p-6 shadow-xl">
          <h1 className="mb-2 text-center text-2xl font-bold">FinanceApp</h1>
          <p className="mb-6 text-center text-sm text-gray-400">
            Desbloqueie para acessar suas finanças.
          </p>

          <button
            onClick={autenticarBiometria}
            className="mb-4 w-full rounded-xl bg-blue-500 px-4 py-3 font-semibold text-white"
          >
            Usar biometria
          </button>

          <input
            type="password"
            inputMode="numeric"
            placeholder="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="mb-3 w-full rounded-xl border border-gray-700 bg-black px-4 py-3 text-center text-white outline-none"
          />

          <button
            onClick={() => {
              const ok = autenticarPIN(pin)
              if (!ok) alert('PIN inválido')
            }}
            className="w-full rounded-xl border border-gray-700 px-4 py-3 font-semibold text-white"
          >
            Entrar com PIN
          </button>

          <p className="mt-4 text-center text-xs text-gray-500">
            PIN padrão temporário: 1234
          </p>
        </div>
      </div>
    )
  }

  const renderPage = () => {
    switch (page) {
      case 'dashboard':
        return <Dashboard />
      case 'extrato':
        return <Consolidacao />
      case 'cartoes':
        return <Cartoes />
      case 'metas':
        return <Metas />
      case 'config':
        return <Configuracoes />
      case 'relatorios':
        return <Relatorios />
      default:
        return <Dashboard />
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <ConflictBanner />

      <main className="min-h-screen px-4 pb-24 pt-4">
        {renderPage()}
      </main>

      <BottomNav current={page} onChange={setPage} />
    </div>
  )
}

export default App