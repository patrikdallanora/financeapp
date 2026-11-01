import test from 'node:test'
import assert from 'node:assert/strict'
import { reconcileSnapshots } from '../src/backup/reconcileBackups.js'

const snapshot = (id, tables) => ({ source: { deviceId: id }, createdAt: '2026-11-01', tables })

test('mantém lançamentos exclusivos e nomes conflitantes sem escolher um aparelho', () => {
  const a = snapshot('iphone15', { categorias: [{ id: 1, uuid: 'cat', nome: 'Casa' }],
    lancamentos: [{ id: 8, uuid: 'only15', categoriaId: 1, status: 'pago' }] })
  const b = snapshot('iphone16', { categorias: [{ id: 9, uuid: 'cat', nome: 'Carro' }],
    lancamentos: [{ id: 8, uuid: 'only16', categoriaId: 9, status: 'pendente' }] })
  const before = JSON.stringify([a, b])
  const report = reconcileSnapshots([a, b])
  assert.equal(report.summary.sourceRecords, 4)
  assert.equal(report.summary.identities, 3)
  assert.equal(report.summary.singleSource, 2)
  const category = report.records.find(record => record.key === 'categorias:cat')
  assert.equal(category.state, 'different')
  assert.equal(category.versions[0].original.nome, 'Casa')
  assert.equal(category.versions[1].original.nome, 'Carro')
  assert.equal(JSON.stringify([a, b]), before)
})

test('resolve ID somente dentro da origem e preserva UUID duplicado e órfão', () => {
  const a = snapshot('a', { categorias: [{ id: 1, uuid: 'cat-a', nome: 'Casa' }],
    lancamentos: [{ id: 1, uuid: 'same', categoriaId: 1 }, { id: 2, uuid: 'same', categoriaId: 99 }] })
  const b = snapshot('b', { categorias: [{ id: 1, uuid: 'cat-b', nome: 'Casa' }],
    lancamentos: [{ id: 1, uuid: 'same', categoriaId: 1 }] })
  const report = reconcileSnapshots([a, b])
  assert.ok(report.issues.some(issue => issue.type === 'duplicate_uuid'))
  assert.ok(report.issues.some(issue => issue.type === 'unresolved_legacy_relation'))
  assert.equal(report.records.find(record => record.key === 'lancamentos:same').versions.length, 3)
  assert.equal(report.records.find(record => record.key === 'lancamentos:same').state, 'different')
})
