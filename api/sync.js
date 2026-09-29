import { timingSafeEqual } from 'node:crypto'

export const config = { maxDuration: 60 }
const tabelas = new Set(['usuarios', 'cartoes', 'lancamentos', 'faturas', 'categorias', 'subcategorias', 'metas'])
const autorizado = (a, b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''))
  return y.length > 0 && x.length === y.length && timingSafeEqual(x, y)
}

// Fixed upstream, same credential as the existing API, no Google browser cookies.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ erro: 'Método não permitido.' })
  const secret = process.env.VITE_API_SECRET
  const endpoint = process.env.VITE_SHEETS_API_URL
  if (!secret || !endpoint) return res.status(503).json({ erro: 'Sincronização indisponível.' })
  let body
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {} }
  catch { return res.status(400).json({ erro: 'Pedido inválido.' }) }
  if (!autorizado(req.method === 'POST' ? body.secret : req.query?.secret, secret)) {
    return res.status(401).json({ erro: 'Acesso não autorizado.' })
  }
  const url = new URL(endpoint)
  const options = { method: req.method, cache: 'no-store', redirect: 'follow' }
  if (req.method === 'POST') {
    if (!tabelas.has(body.tabela) || !Array.isArray(body.registros)) return res.status(400).json({ erro: 'Tabela ou registros inválidos.' })
    options.headers = { 'Content-Type': 'text/plain;charset=utf-8' }
    options.body = JSON.stringify({ tabela: body.tabela, registros: body.registros, deviceId: body.deviceId, secret })
  } else {
    if (req.query.modo && !['pullBatch', 'checkChanges'].includes(req.query.modo)) return res.status(400).json({ erro: 'Consulta inválida.' })
    if (req.query.tabela && !tabelas.has(req.query.tabela)) return res.status(400).json({ erro: 'Tabela inválida.' })
    if (req.query.tabelas && !String(req.query.tabelas).split(',').every(t => tabelas.has(t))) return res.status(400).json({ erro: 'Tabelas inválidas.' })
    for (const key of ['modo', 'tabela', 'tabelas', 'updatedAfter', 'updatedAfterMap', 'meta']) {
      if (req.query[key]) url.searchParams.set(key, String(req.query[key]))
    }
    url.searchParams.set('secret', secret)
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 55000)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    const raw = await response.text()
    let data
    try { data = JSON.parse(raw) }
    catch { return res.status(502).json({ erro: 'O Google não retornou os dados da sincronização. Seus dados continuam salvos no aparelho; haverá nova tentativa automática.' }) }
    if (!response.ok) return res.status(502).json({ erro: 'O Google está temporariamente indisponível. A sincronização tentará novamente.' })
    return res.status(200).json(data)
  } catch {
    return res.status(504).json({ erro: 'A gravação ou consulta ainda não foi confirmada. Seus dados estão salvos e haverá nova tentativa automática.' })
  } finally { clearTimeout(timer) }
}
