import test from 'node:test'
import assert from 'node:assert/strict'
import webPush from 'web-push'

test('cron não envia cobrança quitada e envia somente o saldo parcial', async (t) => {
  const keys = webPush.generateVAPIDKeys()
  const config = {
    VITE_SHEETS_API_URL: 'https://example.invalid/sheets', VITE_API_SECRET: 'test',
    VITE_VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey,
    VAPID_SUBJECT: 'mailto:test@example.invalid'
  }
  const anteriores = Object.fromEntries(Object.keys(config).map((key) => [key, process.env[key]]))
  Object.assign(process.env, config)
  t.after(() => {
    for (const [key, value] of Object.entries(anteriores)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  let pago = 200
  const envios = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.cache, 'no-store')
    const dados = new URL(url).searchParams.get('modo') === 'getPushSubscriptions'
      ? { subscriptions: [{ endpoint: 'https://example.invalid/push', keys: {} }] }
      : { tabelas: {
        cartoes: [{ uuid: 'cartao', diaVencimento: 1 }],
        lancamentos: [1, 2].map((uuid) => ({ uuid, tipo: 'despesa', status: 'pendente',
          metodoPagamento: 'cartao', cartaoUuid: 'cartao', faturaRef: '2020-01', valor: 100,
          faturaValorPago: pago }))
      } }
    return { ok: true, text: async () => JSON.stringify(dados) }
  })
  t.mock.method(webPush, 'sendNotification', async (subscription, payload) => { envios.push(JSON.parse(payload)) })
  const { default: handler } = await import('../api/push/cron.js')
  const executar = async () => {
    const res = { status(code) { this.code = code; return this }, json(body) { this.body = body; return this } }
    await handler({}, res)
    assert.equal(res.code, 200)
    return res.body
  }
  assert.equal((await executar()).notificou, false)
  assert.equal(envios.length, 0)
  pago = 150
  assert.equal((await executar()).enviados, 1)
  assert.equal(envios.length, 1)
  assert.match(envios[0].body, /50,00/)
})
