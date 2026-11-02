import { timingSafeEqual } from 'node:crypto'
import {MIGRATION_CAPTURE_MODE} from '../lib/migrationMode.js'

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if(!MIGRATION_CAPTURE_MODE)return res.status(410).json({erro:'A correção legada foi encerrada. Atualize o aplicativo.'})
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' })
  const expected = Buffer.from(process.env.VITE_API_SECRET || '')
  const received = Buffer.from(String(req.headers['x-financeapp-token'] || ''))
  if (!expected.length || received.length !== expected.length || !timingSafeEqual(expected, received)) return res.status(401).json({ erro: 'Acesso não autorizado.' })
  const endpoint = process.env.VITE_SHEETS_API_URL
  if (!endpoint) return res.status(503).json({ erro: 'Catálogo temporariamente indisponível.' })
  const url = new URL(endpoint)
  url.searchParams.set('secret', expected.toString())
  url.searchParams.set('modo', 'pullBatch')
  url.searchParams.set('tabelas', 'categorias')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 50000)
  try {
    const response = await fetch(url, { method: 'GET', cache: 'no-store', signal: controller.signal })
    const data = await response.json()
    if (!response.ok || data.sucesso !== true || !Array.isArray(data.tabelas?.categorias) || !data.tabelas.categorias.length) throw new Error('invalid_catalog')
    // No writes to Sheets and no financial transactions returned to the client.
    return res.status(200).json({ sucesso: true, categorias: data.tabelas.categorias })
  } catch {
    return res.status(503).json({ erro: 'Não foi possível consultar o catálogo. Os dados do aparelho foram preservados; tente novamente.' })
  } finally { clearTimeout(timer) }
}
