const CACHE_NAME = 'financeapp-v2'

const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
]

self.addEventListener('install', (event) => {
  self.skipWaiting()

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS)
    })
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key)
            }

            return null
          })
        )
      ),
      self.clients.claim()
    ])
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  event.respondWith(
    caches.match(event.request).then((response) => {
      return (
        response ||
        fetch(event.request).catch(() =>
          caches.match('/index.html')
        )
      )
    })
  )
})

self.addEventListener('push', (event) => {
  let dados = {
    title: 'FinanceApp',
    body: 'Você tem uma nova notificação financeira.',
    url: '/'
  }

  if (event.data) {
    try {
      dados = {
        ...dados,
        ...event.data.json()
      }
    } catch {
      dados.body = event.data.text()
    }
  }

  const titulo = dados.title || 'FinanceApp'

  const opcoes = {
    body: dados.body || 'Você tem uma nova notificação financeira.',
    icon: dados.icon || '/icons/icon-192.png',
    badge: dados.badge || '/icons/icon-192.png',
    data: {
      url: dados.url || '/'
    },
    tag: dados.tag || 'financeapp-notificacao',
    renotify: true,
    requireInteraction: Boolean(dados.requireInteraction),
    actions: [
      {
        action: 'abrir',
        title: 'Abrir app'
      }
    ]
  }

  event.waitUntil(
    self.registration.showNotification(titulo, opcoes)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          return
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(url)
      }

      return null
    })
  )
})