import { calcularAlertas, hojeISO } from '../../lib/alertasFinanceiros.js'
import webPush from 'web-push'

const API_URL = process.env.VITE_SHEETS_API_URL
const API_SECRET = process.env.VITE_API_SECRET
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT

const buscarJson = async (url) => {
  const resposta = await fetch(url, { cache: 'no-store' })
  const texto = await resposta.text()
  const dados = texto ? JSON.parse(texto) : {}

  if (!resposta.ok || dados.erro) {
    throw new Error(dados.erro || `Erro HTTP ${resposta.status}`)
  }

  return dados
}

const buscarDadosFinanceiros = async () => {
  const url = new URL(API_URL)

  url.searchParams.set('secret', API_SECRET)
  url.searchParams.set('modo', 'pullBatch')
  url.searchParams.set('tabelas', 'lancamentos,cartoes')

  const dados = await buscarJson(url.toString())

  return {
    lancamentos: dados.tabelas?.lancamentos || [],
    cartoes: dados.tabelas?.cartoes || []
  }
}

const buscarSubscriptions = async () => {
  const url = new URL(API_URL)

  url.searchParams.set('secret', API_SECRET)
  url.searchParams.set('modo', 'getPushSubscriptions')

  const dados = await buscarJson(url.toString())

  return dados.subscriptions || []
}

const enviarPush = async (subscription, payload) => {
  return webPush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys?.p256dh,
        auth: subscription.keys?.auth
      }
    },
    JSON.stringify(payload)
  )
}

export default async function handler(req, res) {
  try {
    if (!API_URL || !API_SECRET) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Variáveis VITE_SHEETS_API_URL ou VITE_API_SECRET não configuradas.'
      })
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Variáveis VAPID não configuradas.'
      })
    }

    webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    const [subscriptions, dadosFinanceiros] = await Promise.all([
      buscarSubscriptions(),
      buscarDadosFinanceiros()
    ])

    const alertas = calcularAlertas(dadosFinanceiros)

    if (!alertas.deveNotificar) {
      return res.status(200).json({
        sucesso: true,
        notificou: false,
        motivo: 'Nenhum alerta financeiro encontrado.',
        subscriptions: subscriptions.length,
        resumo: alertas.resumo
      })
    }

    const payload = {
      title: alertas.titulo,
      body: alertas.corpo,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      url: '/',
      tag: `financeapp-alertas-${hojeISO()}`,
      requireInteraction: false
    }

    const envios = await Promise.allSettled(
      subscriptions.map((subscription) => enviarPush(subscription, payload))
    )

    const enviados = envios.filter((item) => item.status === 'fulfilled').length
    const falhas = envios.filter((item) => item.status === 'rejected').length

    return res.status(200).json({
      sucesso: true,
      notificou: enviados > 0,
      enviados,
      falhas,
      subscriptions: subscriptions.length,
      resumo: alertas.resumo,
      mensagem: alertas.corpo
    })
  } catch (err) {
    return res.status(500).json({
      sucesso: false,
      erro: err.message
    })
  }
}