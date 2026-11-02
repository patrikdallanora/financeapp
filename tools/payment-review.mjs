import fs from 'node:fs/promises'
import path from 'node:path'
import { decode } from '../src/backup/backupCodec.js'
import { normalizeBusinessRecord } from '../src/backup/semanticComparison.js'

const directory = process.argv[2]
const report = JSON.parse(await fs.readFile(path.join(directory, 'three-sources-semantic-private.json'), 'utf8'))
const catalog = (table, uuid) => report.records.find(r => r.key === `${table}:${uuid}`)?.versions[0]?.original.nome || null
const categories = report.records.filter(r => r.key.startsWith('subcategorias:') && r.semanticState === 'different').map(r => ({
  key: r.key, name: r.versions[0].original.nome,
  versions: r.versions.map(v => {
    const canonical = decode(v.comparison)
    return { source: v.sourceLabel, categoryUuid: canonical.categoriaUuid || null,
      categoryName: catalog('categorias', canonical.categoriaUuid), unresolvedId: v.original.categoriaId ?? null }
  })
}))
const groups = new Map()
for (const r of report.records.filter(r => r.key.startsWith('lancamentos:') && r.semanticState === 'different')) {
  const first = r.versions[0].original
  const card = first.metodoPagamento === 'cartao'
  const key = card ? `${first.cartaoUuid}:${normalizeBusinessRecord(first).faturaRef}` : r.key
  if (!groups.has(key)) groups.set(key, { key, kind: card ? 'invoice' : 'expense',
    name: card ? catalog('cartoes', first.cartaoUuid) : first.descricao,
    reference: card ? normalizeBusinessRecord(first).faturaRef : normalizeBusinessRecord(first).dataCompetencia,
    records: [] })
  groups.get(key).records.push({ identity: r.key, versions: r.versions.map(v => {
    const normalized = normalizeBusinessRecord(v.original)
    return { source: v.sourceLabel, status: v.original.status, paymentDate: normalized.dataPagamento || null,
      amountCents: normalized.valor, invoicePaidCents: normalized.faturaValorPago,
      invoiceClosed: normalized.faturaFechada }
  }) })
}
const payments = [...groups.values()]
await fs.writeFile(path.join(directory, 'payment-and-category-review-private.json'), JSON.stringify({ categories, payments }, null, 2))
console.log(JSON.stringify({ categoryRelations: categories,
  paymentGroups: payments.map(p => ({ kind: p.kind, name: p.name, reference: p.reference, records: p.records.length,
    variants: [...new Set(p.records.flatMap(r => r.versions.map(v => `${v.source}: ${v.status}, fechado=${v.invoiceClosed}, acumulado=${v.invoicePaidCents}`)))] })) }, null, 2))
