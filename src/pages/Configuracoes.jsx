import { useEffect, useState } from 'react'
import { Wifi, WifiOff, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'

import { CardPremium } from '../components/CardPremium'
import { TopoTela } from '../components/TopoTela'
import { obterStatusSync } from '../sync/syncManager'

const formatarDataHora = (dataISO) => {
  if (!dataISO) return 'Ainda não sincronizado'

  return new Date(dataISO).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export default function Configuracoes() {
  const [statusSync, setStatusSync] = useState(obterStatusSync())

  useEffect(() => {
    const atualizar = () => {
      setStatusSync(obterStatusSync())
    }

    window.addEventListener('financeapp-sync-status', atualizar)
    window.addEventListener('online', atualizar)
    window.addEventListener('offline', atualizar)

    const intervalo = setInterval(atualizar, 5000)

    return () => {
      window.removeEventListener('financeapp-sync-status', atualizar)
      window.removeEventListener('online', atualizar)
      window.removeEventListener('offline', atualizar)
      clearInterval(intervalo)
    }
  }, [])

  const online = navigator.onLine && statusSync.online !== false

  return (
    <div className="space-y-4 pb-24">
      <TopoTela
        titulo="Configurações"
        subtitulo="Ajustes gerais e status operacional do aplicativo."
      />

      <CardPremium className="space-y-4">
        <div className="flex items-start gap-3">
          <div
            className={`
              flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border
              ${
                online
                  ? 'border-[#3AF2A1]/30 bg-[#3AF2A1]/10 text-[#3AF2A1]'
                  : 'border-red-900/60 bg-red-950/30 text-red-300'
              }
            `}
          >
            {online ? <Wifi size={22} /> : <WifiOff size={22} />}
          </div>

          <div>
            <p className="font-black text-[#F4FFF8]">
              Sincronização automática
            </p>

            <p className="mt-1 text-sm leading-5 text-[#91A99C]">
              O app salva tudo offline e sincroniza automaticamente quando houver conexão.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <LinhaStatus
            icone={online ? CheckCircle2 : WifiOff}
            titulo="Conexão"
            valor={online ? 'Online' : 'Offline'}
            destaque={online ? 'positivo' : 'alerta'}
          />

          <LinhaStatus
            icone={statusSync.sincronizando ? RefreshCw : CheckCircle2}
            titulo="Estado"
            valor={statusSync.sincronizando ? 'Sincronizando agora' : 'Automático ativo'}
            destaque="positivo"
          />

          <LinhaStatus
            icone={CheckCircle2}
            titulo="Última sincronização"
            valor={formatarDataHora(statusSync.ultimaSincronizacao)}
            destaque="neutro"
          />

          {statusSync.ultimoErro && (
            <LinhaStatus
              icone={AlertTriangle}
              titulo="Último aviso"
              valor={statusSync.ultimoErro}
              destaque="alerta"
            />
          )}
        </div>
      </CardPremium>

      <CardPremium>
        <p className="font-black text-[#F4FFF8]">Google Sheets</p>

        <p className="mt-2 break-words text-xs leading-5 text-[#91A99C]">
          {import.meta.env.VITE_SHEETS_API_URL || 'URL não configurada'}
        </p>
      </CardPremium>
    </div>
  )
}

function LinhaStatus({ icone: Icone, titulo, valor, destaque }) {
  const cores = {
    positivo: 'text-[#3AF2A1]',
    alerta: 'text-red-300',
    neutro: 'text-[#91A99C]'
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#1C2A24] bg-[#030504]/70 p-3">
      <div className="flex items-center gap-2">
        <Icone size={16} className={cores[destaque] || cores.neutro} />
        <p className="text-xs font-semibold text-[#91A99C]">{titulo}</p>
      </div>

      <p className={`text-right text-xs font-black ${cores[destaque] || cores.neutro}`}>
        {valor}
      </p>
    </div>
  )
}