import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { encode, openBackup } from '../src/backup/backupCodec.js'
import { reconcileSnapshots } from '../src/backup/reconcileBackups.js'

const [inputDir, outputDir, sheetCellsPath] = process.argv.slice(2)
if (!inputDir || !outputDir) throw new Error('Uso: node tools/reconcile-device-backups.mjs INPUT_DIR PRIVATE_OUTPUT_DIR [SHEET_CELLS_JSON]')
await fs.mkdir(outputDir, { recursive: true })
const files = (await fs.readdir(inputDir)).filter(name => name.startsWith('financeapp-') && name.endsWith('.json')).sort()
if (!files.length) throw new Error('Nenhum backup de aparelho encontrado.')
const snapshots = []
const manifest = []
for (const file of files) {
  const bytes = await fs.readFile(path.join(inputDir, file))
  const envelope = JSON.parse(bytes.toString('utf8'))
  const snapshot = await openBackup(envelope)
  snapshots.push(snapshot)
  manifest.push({ file, fileSha256: createHash('sha256').update(bytes).digest('hex'),
    payloadSha256: envelope.sha256, source: snapshot.source, createdAt: snapshot.createdAt, counts: snapshot.counts })
}

const byDevice = Map.groupBy(snapshots, snapshot => snapshot.source.deviceId)
const devices = [...byDevice.entries()].map(([deviceId, versions]) => {
  versions.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return { deviceId, label: versions.find(v => v.source.label)?.source.label || deviceId,
    origin: versions[0].source.origin, versions: versions.length,
    initialAt: versions[0].createdAt, latestAt: versions.at(-1).createdAt,
    sameTablesInitialAndLatest: JSON.stringify(encode(versions[0].tables)) === JSON.stringify(encode(versions.at(-1).tables)),
    counts: versions.at(-1).counts }
})
const latest = [...byDevice.values()].map(versions => versions.at(-1))
const phonesReport = reconcileSnapshots(latest)
await fs.writeFile(path.join(outputDir, 'phones-reconciliation-private.json'), JSON.stringify(phonesReport))

// The cell archive was extracted without rewriting the XLSX. Decode cached
// cell values for comparison; original types/formulas remain in that archive.
function readSheetSnapshot(archive) {
  const tables = {}
  const names = ['usuarios', 'cartoes', 'categorias', 'subcategorias', 'lancamentos', 'faturas', 'metas']
  for (const name of names) {
    const rows = new Map()
    for (const cell of archive.sheets[name] || []) {
      const [, column, rowText] = cell.ref.match(/^([A-Z]+)(\d+)$/)
      const row = Number(rowText)
      let value = cell.type === 's' ? archive.sharedStrings[Number(cell.value)]
        : cell.type === 'inlineStr' ? cell.inline
        : cell.type === 'b' ? cell.value === '1'
        : cell.type === 'n' && cell.value !== null && cell.value !== '' ? Number(cell.value)
        : cell.value ?? cell.inline ?? ''
      if (!rows.has(row)) rows.set(row, new Map())
      rows.get(row).set(column, value)
    }
    const headers = rows.get(1) || new Map()
    tables[name] = [...rows.entries()].filter(([row]) => row !== 1).sort(([a], [b]) => a - b)
      .map(([, cells]) => Object.fromEntries([...headers.entries()].map(([column, header]) => [header, cells.get(column) ?? ''])))
  }
  return { source: { deviceId: 'sheets-before-migration', label: 'Sheets backup', origin: 'google-sheets' },
    createdAt: '2026-11-01T15:20:51.240Z', tables }
}

const typeCounts = issues => Object.fromEntries([...Map.groupBy(issues, i => `${i.table || i.key?.split(':')[0] || 'other'}:${i.type}`)].map(([key, values]) => [key, values.length]))
const tableSummary = report => Object.fromEntries([...Map.groupBy(report.records, r => r.key.split(':')[0])].map(([name, records]) => [name, {
  union: records.length, different: records.filter(r => r.state === 'different').length,
  onlyFirst: records.filter(r => r.versions.length === 1 && r.versions[0].sourceVersion.startsWith(latest[0].source.deviceId + '@')).length,
  onlySecond: records.filter(r => r.versions.length === 1 && r.versions[0].sourceVersion.startsWith(latest[1]?.source.deviceId + '@')).length
}]))
const summary = { devices, verifiedFiles: manifest.length, phones: { ...phonesReport.summary,
  byTable: tableSummary(phonesReport), issueTypes: typeCounts(phonesReport.issues) } }
if (sheetCellsPath) {
  const sheet = readSheetSnapshot(JSON.parse(await fs.readFile(sheetCellsPath, 'utf8')))
  const allReport = reconcileSnapshots([...latest, sheet])
  await fs.writeFile(path.join(outputDir, 'three-sources-reconciliation-private.json'), JSON.stringify(allReport))
  summary.withSheets = { ...allReport.summary, issueTypes: typeCounts(allReport.issues),
    byTable: Object.fromEntries([...Map.groupBy(allReport.records, r => r.key.split(':')[0])].map(([name, records]) => [name, {
      union: records.length, different: records.filter(r => r.state === 'different').length,
      onlySheets: records.filter(r => r.versions.every(v => v.sourceVersion.startsWith('sheets-before-migration@'))).length,
      absentFromSheets: records.filter(r => r.versions.every(v => !v.sourceVersion.startsWith('sheets-before-migration@'))).length
    }])) }
}
await fs.writeFile(path.join(outputDir, 'verified-phone-manifest.json'), JSON.stringify(manifest, null, 2))
await fs.writeFile(path.join(outputDir, 'reconciliation-summary.json'), JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
