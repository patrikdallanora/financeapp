import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import fs from 'node:fs/promises'
import path from 'node:path'
import { encode, openBackup, sealBackup } from '../src/backup/backupCodec.js'
import { applyCategoryRepair } from '../src/backup/categoryRepair.js'
import { auditCategoryLinks } from '../src/backup/auditCategoryLinks.js'

const [inputDir, outputDir] = process.argv.slice(2)
await fs.mkdir(outputDir, { recursive: true })
const sources = []
for (const name of (await fs.readdir(inputDir)).filter(n => n.startsWith('financeapp-') && n.endsWith('.json') && !n.includes('-inicial-'))) {
  const envelope = JSON.parse(await fs.readFile(path.join(inputDir, name), 'utf8'))
  sources.push({ envelope, snapshot: await openBackup(envelope) })
}
const fullCatalog = process.argv[4] ? JSON.parse(await fs.readFile(process.argv[4], 'utf8'))
  : [...new Map(sources.flatMap(s => s.snapshot.tables.categorias).map(row => [row.uuid, row])).values()]
const corrected = [], results = []
for (const { snapshot, envelope } of sources) {
  const db = new Dexie(`real-copy-repair-${crypto.randomUUID()}`)
  db.version(1).stores(Object.fromEntries(snapshot.tableNames.map(name => [name, '++id'])))
  await db.open()
  try {
    for (const name of snapshot.tableNames) await db.table(name).bulkAdd(snapshot.tables[name])
    const result = await applyCategoryRepair(db, snapshot, fullCatalog)
    const tables = {}
    for (const name of snapshot.tableNames) tables[name] = await db.table(name).toArray()
    for (const original of snapshot.tables.lancamentos) {
      const row = tables.lancamentos.find(item => item.id === original.id)
      const allowed = ['categoriaId', 'subcategoriaId', ...(result.approvedReclassificationUuids.includes(original.uuid) ? ['categoriaUuid'] : [])]
      const stripIds = record => Object.fromEntries(Object.entries(record).filter(([key]) => !allowed.includes(key)))
      if (JSON.stringify(encode(stripIds(row))) !== JSON.stringify(encode(stripIds(original)))) throw new Error('Conteúdo financeiro alterado')
    }
    const derived = { ...snapshot, tables,
      counts: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])),
      localVerificationOnly: true, derivedFromPayloadSha256: envelope.sha256 }
    corrected.push(derived)
    const correctedEnvelope = await sealBackup(derived)
    await openBackup(correctedEnvelope)
    await fs.writeFile(path.join(outputDir, `${snapshot.source.label}-corrected-copy.json`), JSON.stringify(correctedEnvelope))
    // A second application must converge without creating categories or edits.
    const repeated = await applyCategoryRepair(db, derived, fullCatalog)
    if (repeated.summary.addedCategories || repeated.summary.repairedLaunches || repeated.summary.repairedSubcategories) {
      const changes = repeated.tables.subcategorias.flatMap((row, i) => {
        const old = derived.tables.subcategorias[i]
        const fields = [...new Set([...Object.keys(row), ...Object.keys(old)])].filter(key => JSON.stringify(row[key]) !== JSON.stringify(old[key]))
        return fields.length ? [{ name: row.nome, fields, oldParent: old.categoriaUuid, newParent: row.categoriaUuid,
          firstPlanned: result.tables.subcategorias.find(s => s.uuid === row.uuid)?.categoriaUuid }] : []
      })
      throw new Error(`Correção não idempotente: ${JSON.stringify({ summary: repeated.summary, changes })}`)
    }
    results.push({ label: snapshot.source.label, ...result.summary, pending: result.pending, amountsAndPaymentsPreserved: true, idempotent: true })
  } finally { await db.delete() }
}
const audit = auditCategoryLinks(corrected)
const summary = { appliedTo: 'isolated-copies-only', results,
  afterAudit: audit.sources.map(s => ({ label: s.label, ...s.summary })),
  remainingCrossDeviceCategoryNameDifferences: audit.crossDevice.map(s => s.count) }
await fs.writeFile(path.join(outputDir, 'correction-verification.json'), JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
