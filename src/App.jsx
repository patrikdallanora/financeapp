import { useEffect, useState } from 'react'
import { useDbReady } from './hooks/useDbReady'
import { useAuth } from './hooks/useAuth'
import { iniciarAutoSync } from './sync/syncManager'

import LockScreen from './pages/LockScreen'
import Dashboard from './pages/Dashboard'
import Lancamento from './pages/Lancamento'
import Cartoes from './pages/Cartoes'
import Metas from './pages/Metas'
import Categorias from './pages/Categorias'
import Configuracoes from './pages/Configuracoes'

import { BottomNav } from './components/BottomNav'
import { ConflictBanner } from './components/ConflictBanner'

function App() {
  const { ready, error } = useDbReady()
  const {
    authenticated,
    loading,
    authError,
    biometriaDisponivel,
    autenticarBiometria,
    autenticarPIN
  } = useAuth()

  const [page, setPage] = useState('dashboard')
  const [configLancamento, setConfigLancamento] = useState(null)

  useEffect(() => {
    if (ready && authenticated) {
      iniciarAutoSync()
    }
  }, [ready, authenticated])

  if (loading || !ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-pulse rounded-2xl border border-[#3AF2A1]/30 bg-[#3AF2A1]/10" />
          <p className="text-sm font-semibold text-[#91A99C]">Carregando FinanceApp...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-6 text-center text-red-400">
        Erro ao iniciar o banco local.
      </div>
    )
  }

  if (!authenticated) {
    return (
      <LockScreen
        autenticarBiometria={autenticarBiometria}
        autenticarPIN={autenticarPIN}
        authError={authError}
        biometriaDisponivel={biometriaDisponivel}
      />
    )
  }

  const abrirLancamento = (config) => {
    setConfigLancamento(config)
    setPage('lancamento')
  }

  const voltarDashboard = () => {
    setConfigLancamento(null)
    setPage('dashboard')
  }

  const renderPage = () => {
    switch (page) {
      case 'dashboard':
        return <Dashboard onNovoLancamento={abrirLancamento} />
      case 'lancamento':
        return (
          <Lancamento
            configInicial={configLancamento}
            onVoltar={voltarDashboard}
          />
        )
      case 'cartoes':
        return <Cartoes />
      case 'metas':
        return <Metas />
      case 'categorias':
        return <Categorias />
      case 'config':
        return <Configuracoes />
      default:
        return <Dashboard onNovoLancamento={abrirLancamento} />
    }
  }

  const mostrarMenu = page !== 'lancamento'

  return (
    <div className="min-h-screen bg-black text-white">
      <ConflictBanner />

      <main className="min-h-screen px-4 pb-28 pt-4">
        {renderPage()}
      </main>

      {mostrarMenu && <BottomNav current={page} onChange={setPage} />}
    </div>
  )
}

export default App