import fs from 'node:fs/promises'
import handler from '../api/category-repair.js'

const result = { setHeader() {}, status(code) { this.code = code; return this }, json(body) { this.body = body; return this } }
await handler({ method: 'POST', headers: { 'x-financeapp-token': process.env.VITE_API_SECRET || '' } }, result)
if (result.code !== 200) throw new Error(`Consulta ao catálogo: HTTP ${result.code}; ${result.body.erro}`)
const ids = result.body.categorias.map(row => row.uuid)
if (ids.some(uuid => !uuid) || new Set(ids).size !== ids.length) throw new Error('Identidades inconsistentes no catálogo')
if (process.argv[2]) await fs.writeFile(process.argv[2], JSON.stringify(result.body.categorias))
console.log(JSON.stringify({ status: result.code, categoryCount: ids.length, uniqueIdentities: true, readOnly: true }))
