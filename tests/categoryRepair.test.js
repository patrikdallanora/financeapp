import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import test from 'node:test'
import assert from 'node:assert/strict'
import { applyCategoryRepair, planCategoryRepair } from '../src/backup/categoryRepair.js'
import handler from '../api/category-repair.js'

function fixture() {
  return { source: { deviceId: 'test' }, tables: {
    categorias: [{ id: 1, uuid: 'wrong', nome: 'Transporte', tipo: 'despesa' }],
    subcategorias: [{ id: 7, uuid: 'wash', nome: 'Lavagem', categoriaId: 1, categoriaUuid: 'wrong' }],
    lancamentos: [{ id: 10, uuid: 'l', categoriaUuid: 'car', categoriaId: 1,
      subcategoriaUuid: 'wash', subcategoriaId: 7, valor: 50.01, status: 'pago',
      dataPagamento: '2026-09-01', deletedAt: null, syncStatus: 'pending', unknown: 'preserve' }]
  } }
}
const catalog = [{ uuid: 'wrong', nome: 'Transporte', tipo: 'despesa' }, { uuid: 'car', nome: 'Carro', tipo: 'despesa' }]
async function setup(t) {
  const db = new Dexie(`category-repair-test-${crypto.randomUUID()}`)
  db.version(1).stores({ categorias: '++id,uuid', subcategorias: '++id,uuid', lancamentos: '++id,uuid' })
  await db.open(); t.after(() => db.delete())
  const snapshot = fixture()
  for (const [name, rows] of Object.entries(snapshot.tables)) await db.table(name).bulkAdd(rows)
  return { db, snapshot }
}

test('repara catálogo e IDs preservando valores, quitações e dados originais', async t => {
  const { db, snapshot } = await setup(t)
  const original = structuredClone(snapshot)
  const result = await applyCategoryRepair(db, snapshot, catalog)
  assert.equal(result.summary.addedCategories, 1)
  const repaired = await db.lancamentos.get(10)
  assert.equal(repaired.categoriaId, 2)
  assert.equal(repaired.categoriaUuid, 'car')
  const { categoriaId, ...financialAfter } = repaired
  const { categoriaId: oldId, ...financialBefore } = snapshot.tables.lancamentos[0]
  assert.deepEqual(financialAfter, financialBefore)
  assert.equal((await db.subcategorias.get(7)).categoriaUuid, 'car')
  assert.deepEqual(snapshot, original)
  const current = { tables: {} }
  for (const name of Object.keys(snapshot.tables)) current.tables[name] = await db.table(name).toArray()
  const second = await applyCategoryRepair(db, current, catalog)
  assert.equal(second.summary.repairedLaunches, 0)
  assert.equal(second.summary.addedCategories, 0)
})

test('alteração concorrente ou catálogo incompleto aborta sem escritas parciais', async t => {
  const { db, snapshot } = await setup(t)
  await db.lancamentos.update(10, { valor: 51 })
  await assert.rejects(applyCategoryRepair(db, snapshot, catalog), /mudaram/)
  assert.equal(await db.categorias.count(), 1)
  assert.equal((await db.lancamentos.get(10)).valor, 51)
  assert.throws(() => planCategoryRepair(snapshot, catalog.slice(0, 1)), /Carro/)
  assert.throws(() => planCategoryRepair(snapshot, [...catalog, catalog[1]]), /duplicada/)
})

test('subcategoria legada sem UUID converge na primeira execução usando vínculo unívoco dos lançamentos', () => {
  const snapshot = { tables: {
    categorias: [{ id: 1, uuid: 'seed', nome: 'Saúde' }],
    subcategorias: [{ id: 2, uuid: 'sub', nome: 'Baby', categoriaId: 1 }],
    lancamentos: [{ id: 3, uuid: 'l', categoriaUuid: 'canonical', categoriaId: 1, subcategoriaUuid: 'sub' }]
  } }
  const complete = [{ uuid: 'seed', nome: 'Saúde' }, { uuid: 'canonical', nome: 'Saúde' }]
  const planned = planCategoryRepair(snapshot, complete)
  assert.equal(planned.tables.subcategorias[0].categoriaUuid, 'canonical')
  const repeated = planCategoryRepair({ tables: planned.tables }, complete)
  assert.equal(repeated.summary.repairedSubcategories, 0)
  assert.equal(repeated.summary.repairedLaunches, 0)
})

test('endpoint exige credencial e faz somente leitura de categorias', async t => {
  const previous = { ...process.env }
  process.env.VITE_API_SECRET = 'test-secret'
  process.env.VITE_SHEETS_API_URL = 'https://example.invalid/sheets'
  t.after(() => {
    for (const key of ['VITE_API_SECRET', 'VITE_SHEETS_API_URL']) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]
    }
  })
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++
    assert.equal(options.method, 'GET')
    assert.equal(new URL(url).searchParams.get('tabelas'), 'categorias')
    return new Response(JSON.stringify({ sucesso: true, tabelas: { categorias: catalog } }))
  })
  const response = () => ({ setHeader() {}, status(code) { this.code = code; return this }, json(body) { this.body = body; return this } })
  const denied = response(); await handler({ method: 'POST', headers: {} }, denied)
  assert.equal(denied.code, 401); assert.equal(calls, 0)
  const allowed = response(); await handler({ method: 'POST', headers: { 'x-financeapp-token': 'test-secret' } }, allowed)
  assert.equal(allowed.code, 200); assert.deepEqual(allowed.body.categorias, catalog)
  assert.equal(allowed.body.lancamentos, undefined)
})

test('aplica a classificação confirmada de Água/Casal em refeição uma única vez', () => {
  const snapshot = { tables: {
    categorias: [{ id: 1, uuid: 'other', nome: 'Outros' }, { id: 2, uuid: 'meal', nome: 'Refeição Livre' }],
    subcategorias: [{ id: 3, uuid: 'couple', nome: 'Casal', categoriaUuid: 'meal', categoriaId: 2 }],
    lancamentos: [{ id: 4, uuid: 'water', descricao: 'Água', categoriaUuid: 'other', categoriaId: 1,
      subcategoriaUuid: 'couple', subcategoriaId: 3, valor: 5, status: 'pago' }]
  } }
  const planned = planCategoryRepair(snapshot, snapshot.tables.categorias)
  assert.equal(planned.summary.approvedReclassifications, 1)
  assert.equal(planned.tables.lancamentos[0].categoriaUuid, 'meal')
  assert.equal(planned.pending.length, 0)
  assert.equal(planned.tables.lancamentos[0].valor, 5)
  const repeated = planCategoryRepair({ tables: planned.tables }, snapshot.tables.categorias)
  assert.equal(repeated.summary.repairedLaunches, 0)
  assert.equal(repeated.summary.approvedReclassifications, 0)
})
