import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { encode, openBackup } from '../src/backup/backupCodec.js'
import { auditCategoryLinks } from '../src/backup/auditCategoryLinks.js'

const [originalDir, expectedDir, outputDir, ...inputs] = process.argv.slice(2)
if (!inputs.length) throw new Error('Informe os backups pós-correção.')
await fs.mkdir(outputDir, { recursive: true })
const originals = []
for (const name of (await fs.readdir(originalDir)).filter(n => n.startsWith('financeapp-') && n.endsWith('.json') && !n.includes('-inicial-'))) {
  originals.push(await openBackup(JSON.parse(await fs.readFile(path.join(originalDir, name), 'utf8'))))
}
const equal = (a, b) => JSON.stringify(encode(a)) === JSON.stringify(encode(b))
const snapshots = [], results = []
for (const file of inputs) {
  const bytes = await fs.readFile(file)
  const envelope = JSON.parse(bytes.toString('utf8'))
  const current = await openBackup(envelope)
  const original = originals.find(s => s.source.deviceId === current.source.deviceId)
  if (!original || current.source.origin !== original.source.origin) throw new Error('Origem não reconhecida')
  const expected = await openBackup(JSON.parse(await fs.readFile(path.join(expectedDir, `${current.source.label}-corrected-copy.json`), 'utf8')))
  const tableResults = Object.fromEntries(current.tableNames.map(name => [name, {
    count: current.tables[name].length, matchesExpectedCorrection: equal(current.tables[name], expected.tables[name])
  }]))
  const changes = []
  const currentByUuid = new Map(current.tables.lancamentos.map(r => [r.uuid, r]))
  if (currentByUuid.size !== original.tables.lancamentos.length || current.tables.lancamentos.length !== original.tables.lancamentos.length) throw new Error('Identidades ou contagem de lançamentos divergentes')
  for (const before of original.tables.lancamentos) {
    const after = currentByUuid.get(before.uuid)
    if (!after) throw new Error('Lançamento original ausente')
    const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(key => !equal(before[key], after[key]))
    if (fields.length) changes.push({ uuid: before.uuid, fields })
    const expectedRecord = expected.tables.lancamentos.find(r => r.uuid === before.uuid)
    const allowed = ['categoriaId', 'subcategoriaId', ...(before.categoriaUuid !== expectedRecord.categoriaUuid ? ['categoriaUuid'] : [])]
    if (fields.some(key => !allowed.includes(key))) throw new Error('Alteração fora dos vínculos autorizados')
  }
  const target = path.join(outputDir, path.basename(file))
  try { await fs.writeFile(target, bytes, { flag: 'wx' }) }
  catch (error) { if (error.code !== 'EEXIST' || !bytes.equals(await fs.readFile(target))) throw error }
  if (!bytes.equals(await fs.readFile(target))) throw new Error('Cópia privada divergente')
  snapshots.push(current)
  results.push({ label: current.source.label, capturedAt: current.createdAt, file: path.basename(file),
    fileSha256: createHash('sha256').update(bytes).digest('hex'), payloadSha256: envelope.sha256,
    tables: tableResults, allTablesMatchExpected: Object.values(tableResults).every(result => result.matchesExpectedCorrection),
    changedLaunchReferences: changes.length, moneyPaymentsAndAllOtherLaunchFieldsPreserved: true,
    referenceChanges: changes })
}
const audit = auditCategoryLinks(snapshots)
const summary = { verifiedFiles: results.length, results: results.map(({ referenceChanges, ...result }) => result),
  categoryAudit: audit.sources.map(source => ({ label: source.label, ...source.summary })),
  crossDeviceNameDifferences: audit.crossDevice.map(group => group.count),
  correctionConfirmedOnBothDevices: results.length === 2 && results.every(result => result.allTablesMatchExpected)
    && audit.sources.every(source => source.summary.affectedLaunches === 0) }
await fs.writeFile(path.join(outputDir, 'post-repair-verification-private.json'), JSON.stringify({ summary, results, audit }, null, 2))
await fs.writeFile(path.join(outputDir, 'verification-summary.json'), JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
