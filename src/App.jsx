import { useState } from 'react'
import { useDbReady } from './hooks/useDbReady'
import { useAuth } from './hooks/useAuth'

import Dashboard from './pages/Dashboard'
import Consolidacao from './pages/Consolidacao'
import Cartoes from './pages/Cartoes'
import Metas from './pages/Metas'
import Categorias from './pages/Categorias'
import Configuracoes from './pages/Configuracoes'

import { BottomNav } from './components/BottomNav'
import { ConflictBanner } from './components/ConflictBanner'

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
        <div className="w-full max-w-sm rounded-2xl border border-[#1C2A24] bg-[#0B0F0D] p-6 shadow-xl">
          <h1 className="mb-2 text-center text-2xl font-black texto-metalico-verde">
            FinanceApp
          </h1>

          <p className="mb-6 text-center text-sm text-[#8FA99B]">
            Desbloqueie para acessar suas finanças.
          </p>

          <button
            onClick={autenticarBiometria}
            className="mb-4 min-h-[48px] w-full rounded-2xl bg-gradient-to-br from-[#39FF88] via-[#00E676] to-[#007A3D] px-4 py-3 font-bold text-black shadow-[0_12px_30px_rgba(0,230,118,0.22)]"
          >
            Usar biometria
          </button>

          <input
            type="password"
            inputMode="numeric"
            placeholder="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="mb-3 min-h-[48px] w-full rounded-2xl border border-[#1C2A24] bg-black px-4 py-3 text-center text-white outline-none focus:border-[#00E676]"
          />

          <button
            onClick={() => {
              const ok = autenticarPIN(pin)
              if (!ok) alert('PIN inválido')
            }}
            className="min-h-[48px] w-full rounded-2xl border border-[#1C2A24] px-4 py-3 font-bold text-[#39FF88]"
          >
            Entrar com PIN
          </button>

          <p className="mt-4 text-center text-xs text-[#8FA99B]">
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
      case 'categorias':
        return <Categorias />
      case 'config':
        return <Configuracoes />
      default:
        return <Dashboard />
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <ConflictBanner />

      <main className="min-h-screen px-4 pb-28 pt-4">
        {renderPage()}
      </main>

      <BottomNav current={page} onChange={setPage} />
    </div>
  )
}

export default App