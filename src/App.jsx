import { useEffect, useRef, useState } from 'react'
import { useDbReady } from './hooks/useDbReady'
import { useAuth } from './hooks/useAuth'
import { executarPullInicial, iniciarAutoSync } from './sync/syncManager'

import LockScreen from './pages/LockScreen'
import Dashboard from './pages/Dashboard'
import Lancamento from './pages/Lancamento'
import Extratos from './pages/Extratos'
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
  const [filtroExtratos, setFiltroExtratos] = useState('todos')
  const [mostrandoPullInicial, setMostrandoPullInicial] = useState(false)

  const pullInicialExecutado = useRef(false)

  useEffect(() => {
    if (!ready || !authenticated || pullInicialExecutado.current) return

    pullInicialExecutado.current = true

    let componenteAtivo = true

    const timerLoading = setTimeout(() => {
      if (componenteAtivo) {
        setMostrandoPullInicial(true)
      }
    }, 700)

    const iniciar = async () => {
      await executarPullInicial()

      if (!componenteAtivo) return

      clearTimeout(timerLoading)
      setMostrandoPullInicial(false)

      iniciarAutoSync({
        executarAoIniciar: false
      })
    }

    iniciar()

    return () => {
      componenteAtivo = false
      clearTimeout(timerLoading)
    }
  }, [ready, authenticated])

  if (loading || !ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-pulse rounded-2xl border border-[#3AF2A1]/30 bg-[#3AF2A1]/10" />
          <p className="text-sm font-semibold text-[#91A99C]">
            Carregando FinanceApp...
          </p>
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

  const abrirExtratos = (filtroInicial) => {
    setFiltroExtratos(filtroInicial || 'todos')
    setPage('extratos')
  }

  const voltarDashboard = () => {
    setConfigLancamento(null)
    setPage('dashboard')
  }

  const renderPage = () => {
    switch (page) {
      case 'dashboard':
        return (
          <Dashboard
            onNovoLancamento={abrirLancamento}
            onAbrirExtratos={abrirExtratos}
          />
        )
      case 'lancamento':
        return (
          <Lancamento
            configInicial={configLancamento}
            onVoltar={voltarDashboard}
          />
        )
      case 'extratos':
        return (
          <Extratos
            filtroInicial={filtroExtratos}
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
        return (
          <Dashboard
            onNovoLancamento={abrirLancamento}
            onAbrirExtratos={abrirExtratos}
          />
        )
    }
  }

  const mostrarMenu = page !== 'lancamento' && page !== 'extratos'

  return (
    <div className="min-h-screen bg-black text-white">
      <ConflictBanner />

      <main className="min-h-screen px-4 pb-28 pt-4">
        {renderPage()}
      </main>

      {mostrarMenu && <BottomNav current={page} onChange={setPage} />}

      {mostrandoPullInicial && <LoadingPullInicial />}
    </div>
  )
}

function LoadingPullInicial() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[90] flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-3xl border border-[#1C3D2E] bg-[#03130C]/95 px-4 py-3 shadow-[0_0_30px_rgba(58,242,161,0.16)] backdrop-blur-xl">
        <div className="h-4 w-4 animate-pulse rounded-full bg-[#3AF2A1] shadow-[0_0_18px_rgba(58,242,161,0.9)]" />

        <div>
          <p className="text-xs font-black text-[#F4FFF8]">
            Atualizando dados
          </p>
          <p className="text-[11px] text-[#91A99C]">
            Buscando alterações recentes...
          </p>
        </div>
      </div>
    </div>
  )
}

export default App