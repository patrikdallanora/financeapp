const API_URL = import.meta.env.VITE_SHEETS_API_URL
const API_SECRET = import.meta.env.VITE_API_SECRET
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

const CHAVE_DEVICE_ID = 'financeapp_device_id'
const CHAVE_NOTIFICACOES_ATIVAS = 'financeapp_notificacoes_ativas'

const obterDeviceId = () => {
  let deviceId = localStorage.getItem(CHAVE_DEVICE_ID)

  if (!deviceId) {
    deviceId = crypto.randomUUID()
    localStorage.setItem(CHAVE_DEVICE_ID, deviceId)
  }

  return deviceId
}

const converterBase64ParaUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = `${base64String}${padding}`
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const dadosBrutos = window.atob(base64)
  const outputArray = new Uint8Array(dadosBrutos.length)

  for (let i = 0; i < dadosBrutos.length; i++) {
    outputArray[i] = dadosBrutos.charCodeAt(i)
  }

  return outputArray
}

export const notificacoesSuportadas = () => {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

export const obterStatusNotificacoes = () => {
  if (!notificacoesSuportadas()) {
    return {
      suportado: false,
      permissao: 'unsupported',
      ativo: false
    }
  }

  return {
    suportado: true,
    permissao: Notification.permission,
    ativo:
      Notification.permission === 'granted' &&
      localStorage.getItem(CHAVE_NOTIFICACOES_ATIVAS) === 'true'
  }
}

export const ativarNotificacoes = async () => {
  if (!notificacoesSuportadas()) {
    throw new Error('Este dispositivo/navegador não suporta notificações push.')
  }

  if (!VAPID_PUBLIC_KEY) {
    throw new Error('VITE_VAPID_PUBLIC_KEY não configurada.')
  }

  const permissao = await Notification.requestPermission()

  if (permissao !== 'granted') {
    localStorage.setItem(CHAVE_NOTIFICACOES_ATIVAS, 'false')
    throw new Error('Permissão de notificação não concedida.')
  }

  const registration = await navigator.serviceWorker.ready

  let subscription = await registration.pushManager.getSubscription()

if (!subscription) {
  subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: converterBase64ParaUint8Array(VAPID_PUBLIC_KEY)
  })
}

  const resposta = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify({
      secret: API_SECRET,
      modo: 'savePushSubscription',
      deviceId: obterDeviceId(),
      userAgent: navigator.userAgent,
      subscription: subscription.toJSON()
    })
  })

  const texto = await resposta.text()
  const dados = texto ? JSON.parse(texto) : {}

if (!resposta.ok || dados.erro) {
  throw new Error(
    `Erro ao salvar inscrição: ${JSON.stringify(dados)}`
  )
}

  localStorage.setItem(CHAVE_NOTIFICACOES_ATIVAS, 'true')

  return {
    sucesso: true,
    subscription: subscription.toJSON(),
    resposta: dados
  }
}

export const desativarNotificacoesLocalmente = async () => {
  if (!notificacoesSuportadas()) {
    localStorage.setItem(CHAVE_NOTIFICACOES_ATIVAS, 'false')
    return
  }

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()

  if (subscription) {
    await subscription.unsubscribe()
  }

  localStorage.setItem(CHAVE_NOTIFICACOES_ATIVAS, 'false')
}

export const enviarNotificacaoTeste = async () => {
  if (!notificacoesSuportadas()) {
    throw new Error('Este dispositivo/navegador não suporta notificações.')
  }

  if (Notification.permission !== 'granted') {
    throw new Error('Notificações ainda não foram permitidas.')
  }

  const registration = await navigator.serviceWorker.ready

  await registration.showNotification('FinanceApp', {
    body: 'Notificações ativadas com sucesso neste aparelho.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: {
      url: '/'
    }
  })
}