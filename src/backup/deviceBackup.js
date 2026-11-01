import { captureSyncMetadata, encode, openBackup, sealBackup } from './backupCodec.js'

export function createBackupService({ db, archive, storage, origin, cryptoApi = globalThis.crypto }) {
  const archiveTable = archive.table('snapshots')

  async function capture({ kind = 'manual', label = '' } = {}) {
    const names = db.tables.map(table => table.name).sort()
    let deviceId = storage.getItem('financeapp_device_id')
    if (!deviceId) {
      deviceId = cryptoApi.randomUUID()
      storage.setItem('financeapp_device_id', deviceId)
    }
    const tables = await db.transaction('r', db.tables, async () => {
      const result = {}
      for (const table of db.tables) result[table.name] = await table.toArray()
      return result
    })
    // Hashing and archive I/O happen after the source transaction commits.
    const snapshot = { createdAt: new Date().toISOString(), databaseVersion: db.verno,
      source: { deviceId, origin, label }, tableNames: names, tables,
      counts: Object.fromEntries(names.map(name => [name, tables[name].length])),
      metadata: captureSyncMetadata(storage, names) }
    const envelope = await sealBackup(snapshot, cryptoApi)
    const id = cryptoApi.randomUUID()
    await archiveTable.add({ id, kind, createdAt: snapshot.createdAt, envelope })
    const persisted = await archiveTable.get(id)
    if (!persisted || (await openBackup(persisted.envelope, cryptoApi)).source.deviceId !== deviceId) {
      throw new Error('Não foi possível verificar a cópia local. Os dados originais foram preservados.')
    }
    return { id, kind, envelope, snapshot }
  }

  async function ensureInitial() {
    const existing = await archiveTable.where('kind').equals('before-migration').first()
    if (existing) {
      const snapshot = await openBackup(existing.envelope, cryptoApi)
      return { ...existing, snapshot }
    }
    return capture({ kind: 'before-migration' })
  }

  return { capture, ensureInitial }
}

// Verification only: reconstruct an empty, explicitly separate DB. Never restore
// into FinanceAppDB or overwrite populated databases from this preservation UI.
export async function verifyInIsolatedDatabase(envelope, target, sourceName, cryptoApi = globalThis.crypto) {
  if (target.name === sourceName) throw new Error('A verificação exige um banco separado.')
  const snapshot = await openBackup(envelope, cryptoApi)
  const targetNames = target.tables.map(table => table.name).sort()
  if (JSON.stringify(targetNames) !== JSON.stringify([...snapshot.tableNames].sort())) {
    throw new Error('Schema de verificação incompatível.')
  }
  await target.transaction('rw', target.tables, async () => {
    for (const table of target.tables) {
      if (await table.count()) throw new Error('O banco de verificação precisa estar vazio.')
    }
    for (const table of target.tables) await table.bulkAdd(snapshot.tables[table.name])
  })
  const restored = await target.transaction('r', target.tables, async () => {
    const rows = {}
    for (const table of target.tables) rows[table.name] = await table.toArray()
    return rows
  })
  for (const name of snapshot.tableNames) {
    if (JSON.stringify(encode(restored[name])) !== JSON.stringify(encode(snapshot.tables[name]))) {
      throw new Error(`Verificação de conteúdo falhou: ${name}.`)
    }
  }
  return snapshot.counts
}
