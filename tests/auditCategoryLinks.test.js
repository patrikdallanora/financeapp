import test from 'node:test'
import assert from 'node:assert/strict'
import { auditCategoryLinks } from '../src/backup/auditCategoryLinks.js'

test('detecta nome errado mesmo sem divergência no UUID armazenado entre aparelhos', () => {
  const snapshot = (label, categories) => ({ source: { deviceId: label, label }, tables: {
    categorias: categories, lancamentos: [{ uuid: 'l', categoriaId: 1, categoriaUuid: 'real' }] } })
  const first = snapshot('15', [{ id: 1, uuid: 'other', nome: 'Saúde' }, { id: 2, uuid: 'real', nome: 'Carro' }])
  const second = snapshot('16', [{ id: 1, uuid: 'real', nome: 'Carro' }])
  const before = JSON.stringify([first, second])
  const result = auditCategoryLinks([first, second])
  assert.equal(result.crossDevice[0].count, 1)
  assert.equal(result.sources[0].records[0].displayedName, 'Saúde')
  assert.ok(result.sources[0].records[0].issues.includes('id_match_hides_uuid_match'))
  assert.equal(JSON.stringify([first, second]), before)
})

test('não presume que categorias de mesmo nome são a mesma entidade e detecta catálogo ausente', () => {
  const result = auditCategoryLinks([{ source: { deviceId: 'a', label: 'a' }, tables: {
    categorias: [{ id: 1, uuid: 'one', nome: 'Casa' }, { id: 2, uuid: 'two', nome: 'Casa' }],
    lancamentos: [{ uuid: 'l', categoriaId: 1, categoriaUuid: 'missing' }]
  } }])
  assert.equal(result.sources[0].duplicateNames.length, 1)
  assert.ok(result.sources[0].records[0].issues.includes('uuid_missing_in_all_catalogs'))
})
