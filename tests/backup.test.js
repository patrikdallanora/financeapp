import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import test from 'node:test'
import assert from 'node:assert/strict'
import { captureSyncMetadata, openBackup, sealBackup } from '../src/backup/backupCodec.js'
import { createBackupService, verifyInIsolatedDatabase } from '../src/backup/deviceBackup.js'
import syncHandler from '../api/sync.js'
import cronHandler from '../api/push/cron.js'
import pushTestHandler from '../api/push/test.js'

function database(prefix) {
  const db = new Dexie(`${prefix}-${crypto.randomUUID()}`)
  db.version(1).stores({ lancamentos: '++id,uuid,syncStatus', categorias: '++id,uuid', syncLog: '++id' })
  return db
}
const storage = () => {
  const values = new Map([['financeapp_device_id', 'device-test'], ['financeapp_session', 'do-not-export'],
    ['financeapp_credential_id', 'do-not-export'], ['financeapp_api_secret', 'do-not-export'],
    ['financeapp_ultimo_pull_lancamentos', '2026-09-01']])
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}

async function setup(t) {
  const db = database('source')
  const archive = new Dexie(`archive-${crypto.randomUUID()}`)
  archive.version(1).stores({ snapshots: 'id,kind,createdAt' })
  await Promise.all([db.open(), archive.open()])
  t.after(async () => { await db.delete(); await archive.delete() })
  await db.categorias.add({ id: 7, uuid: 'category', nome: 'Nome deste aparelho' })
  await db.lancamentos.bulkAdd([
    { id: 3, uuid: 'paid-local-only', status: 'pago', valor: 2055.61, categoriaId: 7,
      syncStatus: 'pending', envioIncerto: true, unknownField: { tipo: 'preservar', vazio: undefined },
      date: new Date('2026-09-08T03:00:00Z') },
    { id: 9, uuid: 'deleted', deletedAt: '2026-09-01', syncStatus: 'conflict' },
    { id: 11, uuid: 'duplicated' }, { id: 12, uuid: 'duplicated' }
  ])
  await db.syncLog.add({ localData: 'original-local', remoteData: 'original-remote', resolved: false })
  return { db, archive, service: createBackupService({ db, archive, storage: storage(), origin: 'https://finance.example' }) }
}

test('backup completo restaura em DB isolado sem perder pagos, excluídos, duplicados, campos ou vínculos', async t => {
  const { db, service, archive } = await setup(t)
  const before = await db.lancamentos.toArray()
  const backup = await service.ensureInitial()
  assert.equal(await archive.snapshots.count(), 1)
  assert.deepEqual(await db.lancamentos.toArray(), before)
  const snapshot = await openBackup(JSON.parse(JSON.stringify(backup.envelope)))
  assert.equal(snapshot.counts.lancamentos, 4)
  assert.equal(snapshot.tables.lancamentos[0].categoriaId, 7)
  assert.equal(snapshot.tables.categorias[0].nome, 'Nome deste aparelho')
  assert.equal(snapshot.tables.lancamentos[0].date.toISOString(), '2026-09-08T03:00:00.000Z')
  assert.ok(Object.hasOwn(snapshot.tables.lancamentos[0].unknownField, 'vazio'))
  assert.equal(JSON.stringify(snapshot).includes('do-not-export'), false)
  const target = database('restore-test')
  await target.open()
  t.after(() => target.delete())
  assert.deepEqual(await verifyInIsolatedDatabase(backup.envelope, target, db.name), snapshot.counts)
  assert.deepEqual(await target.lancamentos.toArray(), before)
  assert.deepEqual(await db.lancamentos.toArray(), before)
})

test('cópia inicial permanece imutável após editar e fazer exportações novas', async t => {
  const { db, archive, service } = await setup(t)
  const first = await service.ensureInitial()
  await db.categorias.update(7, { nome: 'Nome alterado' })
  const current = await service.capture({ label: 'iphone-16-pro' })
  assert.equal((await service.ensureInitial()).envelope.sha256, first.envelope.sha256)
  assert.equal(current.snapshot.tables.categorias[0].nome, 'Nome alterado')
  assert.equal(first.snapshot.tables.categorias[0].nome, 'Nome deste aparelho')
  assert.equal(await archive.snapshots.count(), 2)
})

test('backup alterado ou truncado é recusado antes de gravar no destino', async t => {
  const { db, service } = await setup(t)
  const { envelope } = await service.capture()
  const target = database('restore-test')
  await target.open(); t.after(() => target.delete())
  await assert.rejects(verifyInIsolatedDatabase({ ...envelope, payload: envelope.payload + 'x' }, target, db.name), /inválido ou alterado/)
  assert.equal(await target.lancamentos.count(), 0)
})

test('falha de gravação no arquivo local não altera a origem e não anuncia backup concluído', async t => {
  const { db, archive } = await setup(t)
  const before = await db.lancamentos.toArray()
  await archive.close()
  const service = createBackupService({ db, archive, storage: storage(), origin: 'https://finance.example' })
  await assert.rejects(service.capture())
  assert.deepEqual(await db.lancamentos.toArray(), before)
})

test('verificação não sobrescreve origem nem destino populado e transação aborta por inteiro', async t => {
  const { db, service } = await setup(t)
  const { envelope } = await service.capture()
  await assert.rejects(verifyInIsolatedDatabase(envelope, db, db.name), /banco separado/)
  const target = database('restore-test'); await target.open(); t.after(() => target.delete())
  await target.syncLog.add({ id: 1, original: true })
  await assert.rejects(verifyInIsolatedDatabase(envelope, target, db.name), /precisa estar vazio/)
  assert.equal(await target.categorias.count(), 0)
  assert.equal(await target.lancamentos.count(), 0)
  assert.equal((await target.syncLog.get(1)).original, true)
})

test('codec mantém tipos e identifica manifesto incompleto', async () => {
  const sample = { source: { deviceId: 'a' }, tableNames: ['x'], counts: { x: 1 },
    tables: { x: [{ minusZero: -0, nan: NaN, inf: Infinity, string: 'NaN', __marker: ['date'] }] } }
  const result = await openBackup(await sealBackup(sample))
  assert.deepEqual(result, sample)
  await assert.rejects(openBackup(await sealBackup({ ...sample, counts: { x: 0 } })), /Contagem/)
  assert.equal(captureSyncMetadata(storage(), ['lancamentos']).financeapp_session, undefined)
})

test('modo preservação bloqueia API e cron sem consultar nem gravar no Google', async t => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', () => { calls++; throw new Error('Rede indevida') })
  const response = () => ({ setHeader() {}, status(code) { this.code = code; return this }, json(body) { this.body = body; return this } })
  const sync = response(); await syncHandler({ method: 'POST' }, sync)
  assert.equal(sync.code, 503); assert.equal(sync.body.pausado, true)
  const cron = response(); await cronHandler({}, cron)
  assert.equal(cron.body.notificou, false); assert.equal(cron.body.pausado, true)
  const push = response(); await pushTestHandler({}, push)
  assert.equal(push.body.notificou, false); assert.equal(push.body.pausado, true)
  assert.equal(calls, 0)
})
