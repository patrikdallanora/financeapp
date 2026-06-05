import webPush from 'web-push'

const API_URL = process.env.VITE_SHEETS_API_URL
const API_SECRET = process.env.VITE_API_SECRET
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT

webPush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
)

const buscarJson = async (url) => {
  const resposta = await fetch(url)
  const texto = await resposta.text()
  const dados = texto ? JSON.parse(texto) : {}

  if (!resposta.ok || dados.erro) {
    throw new Error(dados.erro || `Erro HTTP ${resposta.status}`)
  }

  return dados
}

const buscarSubscriptions = async () => {
  const url = new URL(API_URL)

  url.searchParams.set('secret', API_SECRET)
  url.searchParams.set('modo', 'getPushSubscriptions')

  const dados = await buscarJson(url.toString())

  return dados.subscriptions || []
}

export default async function handler(req, res) {
  try {
    const subscriptions = await buscarSubscriptions()

    const payload = {
      title: 'FinanceApp',
      body: 'Teste real de push enviado pela Vercel.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      url: '/',
      tag: `financeapp-teste-${Date.now()}`
    }

    const envios = await Promise.allSettled(
      subscriptions.map((subscription) =>
        webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.keys?.p256dh,
              auth: subscription.keys?.auth
            }
          },
          JSON.stringify(payload)
        )
      )
    )

    return res.status(200).json({
      sucesso: true,
      subscriptions: subscriptions.length,
      enviados: envios.filter((item) => item.status === 'fulfilled').length,
      falhas: envios.filter((item) => item.status === 'rejected').length,
      detalhes: envios.map((item) =>
        item.status === 'rejected'
          ? item.reason?.message
          : 'enviado'
      )
    })
  } catch (err) {
    return res.status(500).json({
      sucesso: false,
      erro: err.message
    })
  }
}