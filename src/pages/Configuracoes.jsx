import { useEffect, useState } from 'react'
import {
  ativarNotificacoes,
  enviarNotificacaoTeste,
  obterStatusNotificacoes
} from '../services/notificacoes'
import { Wifi, WifiOff, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'

import { CardPremium } from '../components/CardPremium'
import { TopoTela } from '../components/TopoTela'
import { obterStatusSync, restaurarBaseLocalDoSheets, conferirPagamentosServidor, contarPendenciasSync } from '../sync/syncManager'

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
  const [restaurando, setRestaurando] = useState(false)
  const [conferindo, setConferindo] = useState(false)
  const [conferencia, setConferencia] = useState(null)
  const [erroConferencia, setErroConferencia] = useState('')
  const [pendencias, setPendencias] = useState({ pendentes: 0, conflitos: 0 })
  const conferir = async () => {
    setConferindo(true)
    setConferencia(null)
    setErroConferencia('')
    try { setConferencia(await conferirPagamentosServidor()) }
    catch (erro) { setErroConferencia(erro.message) }
    finally { setConferindo(false) }
  }


  const [statusNotificacoes, setStatusNotificacoes] = useState(
  obterStatusNotificacoes()
)

const [ativandoNotificacoes, setAtivandoNotificacoes] = useState(false)
const [enviandoTeste, setEnviandoTeste] = useState(false)

  useEffect(() => {
    const atualizar = () => {
      setStatusSync(obterStatusSync())
      contarPendenciasSync().then(setPendencias).catch(() => {})
    }

    window.addEventListener('financeapp-sync-status', atualizar)
    window.addEventListener('online', atualizar)
    window.addEventListener('offline', atualizar)

    atualizar()
    const intervalo = setInterval(atualizar, 5000)

    return () => {
      window.removeEventListener('financeapp-sync-status', atualizar)
      window.removeEventListener('online', atualizar)
      window.removeEventListener('offline', atualizar)
      clearInterval(intervalo)
    }
  }, [])

  const restaurarDados = async () => {
    const confirmado = window.confirm(
      'Isso irá apagar os dados locais deste aparelho e baixar novamente tudo do Google Sheets. Deseja continuar?'
    )

    if (!confirmado) return

    try {
      setRestaurando(true)

      await restaurarBaseLocalDoSheets()

      window.location.reload()
    } catch (err) {
      alert(`Erro ao restaurar dados: ${err.message}`)
    } finally {
      setRestaurando(false)
    }
  }

  const habilitarNotificacoes = async () => {
  try {
    setAtivandoNotificacoes(true)

    await ativarNotificacoes()

    setStatusNotificacoes(obterStatusNotificacoes())

    alert('Notificações ativadas com sucesso.')
  } catch (err) {
    alert(err.message)
  } finally {
    setAtivandoNotificacoes(false)
  }
}

const testarNotificacao = async () => {
  try {
    setEnviandoTeste(true)

    await enviarNotificacaoTeste()

    alert('Notificação enviada.')
  } catch (err) {
    alert(err.message)
  } finally {
    setEnviandoTeste(false)
  }
}

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
            valor={statusSync.sincronizando ? 'Sincronizando agora' : statusSync.ultimoErro || pendencias.pendentes || pendencias.conflitos ? 'Requer atenção' : 'Automático ativo'}
            destaque={statusSync.ultimoErro || pendencias.pendentes || pendencias.conflitos ? 'alerta' : 'positivo'}
          />

          <LinhaStatus
            icone={CheckCircle2}
            titulo="Última sincronização"
            valor={formatarDataHora(statusSync.ultimaSincronizacao)}
            destaque="neutro"
          />

          <LinhaStatus icone={RefreshCw} titulo="Aguardando envio" valor={String(pendencias.pendentes)} destaque={pendencias.pendentes ? 'alerta' : 'neutro'} />
          <LinhaStatus icone={AlertTriangle} titulo="Conflitos" valor={String(pendencias.conflitos)} destaque={pendencias.conflitos ? 'alerta' : 'neutro'} />
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

      <CardPremium className="space-y-3">
        <p className="font-black text-[#F4FFF8]">Conferência dos pagamentos</p>
        <p className="text-sm text-[#91A99C]">Compara este aparelho com a base usada nas notificações, sem alterar seus dados.</p>
        <button disabled={conferindo} onClick={conferir} className="w-full rounded-2xl border border-[#3AF2A1]/40 px-4 py-3 text-sm font-bold text-[#3AF2A1] disabled:opacity-50">{conferindo ? 'Conferindo…' : 'Conferir pagamentos no servidor'}</button>
        {erroConferencia && <p role="alert" className="text-sm text-red-300">{erroConferencia}</p>}
        {conferencia && <div className="space-y-3" role="status">
          <p className="text-sm text-[#F4FFF8]">{conferencia.conferidos} lançamentos conferidos · {conferencia.divergencias.length} divergências</p>
          <p className="text-xs text-[#91A99C]">Conferido em {formatarDataHora(conferencia.verificadoEm)}. Resultado dessa consulta; alterações posteriores exigem nova conferência.</p>
          {conferencia.divergencias.slice(0, 20).map(item => <div key={item.uuid} className="rounded-xl border border-amber-900/60 p-3 text-xs text-[#F4FFF8]">
            <p className="font-bold">{item.descricao} · {item.referencia}</p>
            <p>{item.motivo}</p>
            <p>Neste aparelho: {item.local.status || 'sem situação'} · {item.local.sincronizacao || 'sem estado de envio'}</p>
            <p>No servidor: {item.remoto?.status || 'não encontrado'}</p>
            <p>Atualização local: {formatarDataHora(item.local.atualizado)} · Servidor: {formatarDataHora(item.remoto?.atualizado)}</p>
            <p className="break-all text-[#91A99C]">ID: {item.uuid}</p>
          </div>)}
          {conferencia.divergencias.length > 20 && <p className="text-xs text-[#91A99C]">Exibindo as primeiras 20 divergências.</p>}
          {!conferencia.divergencias.length && <p className="text-sm text-[#3AF2A1]">Os pagamentos locais correspondem aos registros consultados no servidor.</p>}
        </div>}
      </CardPremium>

      <CardPremium>
        <p className="font-black text-[#F4FFF8]">Google Sheets</p>

        <p className="mt-2 break-words text-xs leading-5 text-[#91A99C]">
          {import.meta.env.VITE_SHEETS_API_URL || 'URL não configurada'}
        </p>
      </CardPremium>

      <CardPremium>
  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div>
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#3AF2A1]">
        Notificações
      </p>

      <h3 className="mt-1 text-base font-black text-[#F4FFF8]">
        Push Notifications
      </h3>

      <p className="mt-2 text-sm leading-5 text-[#C7D2CC]">
        Receba alertas de despesas vencidas, vencimentos próximos,
        metas estouradas e problemas de sincronização.
      </p>

      <p className="mt-3 text-xs font-semibold text-[#91A99C]">
        Status:{' '}
        {statusNotificacoes.ativo
          ? 'Ativadas'
          : 'Desativadas'}
      </p>
    </div>

    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-col">
      <button
        onClick={habilitarNotificacoes}
        disabled={ativandoNotificacoes}
        className="
          rounded-2xl
          border
          border-[#3AF2A1]/30
          bg-[#3AF2A1]/10
          px-4
          py-3
          text-sm
          font-black
          text-[#3AF2A1]
          disabled:opacity-50
        "
      >
        {ativandoNotificacoes
  ? 'Atualizando...'
  : statusNotificacoes.ativo
  ? 'Atualizar'
  : 'Ativar'}
      </button>

      <button
        onClick={testarNotificacao}
        disabled={
          enviandoTeste ||
          !statusNotificacoes.ativo
        }
        className="
          rounded-2xl
          border
          border-[#1C2A24]
          bg-[#030504]/70
          px-4
          py-3
          text-sm
          font-black
          text-[#F4FFF8]
          disabled:opacity-50
        "
      >
        {enviandoTeste
          ? 'Enviando...'
          : 'Enviar teste'}
      </button>
    </div>
  </div>
</CardPremium>

      <CardPremium className="rounded-[28px] border border-[#4A1D1D] bg-[#190606] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-red-300">
              Recuperação
            </p>

            <h3 className="mt-1 text-base font-black text-[#F4FFF8]">
              Restaurar dados deste aparelho
            </h3>

            <p className="mt-2 text-sm leading-5 text-[#C7D2CC]">
              Apaga os dados locais deste dispositivo e baixa novamente tudo que está salvo no Google Sheets.
            </p>
          </div>

          <button
            onClick={restaurarDados}
            disabled={restaurando}
            className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-black text-red-200 transition active:scale-[0.98] disabled:opacity-50"
          >
            {restaurando ? 'Restaurando...' : 'Restaurar'}
          </button>
        </div>
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
