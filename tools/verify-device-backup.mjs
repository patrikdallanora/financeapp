import fs from 'node:fs/promises'
import path from 'node:path'
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { openBackup } from '../src/backup/backupCodec.js'
import { verifyInIsolatedDatabase } from '../src/backup/deviceBackup.js'

const inputs = process.argv.slice(2)
if (!inputs.length) throw new Error('Informe os arquivos JSON dos aparelhos.')
for (const input of inputs) {
  const envelope = JSON.parse(await fs.readFile(input, 'utf8'))
  const snapshot = await openBackup(envelope)
  const target = new Dexie(`financeapp-verification-${crypto.randomUUID()}`)
  target.version(1).stores(Object.fromEntries(snapshot.tableNames.map(name => [name, '++id'])))
  await target.open()
  try {
    await verifyInIsolatedDatabase(envelope, target, snapshot.databaseName || 'FinanceAppDB')
    console.log(JSON.stringify({ file: path.basename(input), sha256: envelope.sha256,
      verified: true, device: snapshot.source.deviceId, label: snapshot.source.label,
      capturedAt: snapshot.createdAt, counts: snapshot.counts }))
  } finally { await target.delete() }
}
