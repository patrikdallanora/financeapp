import test from 'node:test'
import assert from 'node:assert/strict'
import { distribuirParcelas, somarMeses } from '../src/utils/parcelamento.js'

test('parcelamento distribui todos os centavos sem alterar o total', () => {
  assert.deepEqual(distribuirParcelas(100, 3), [33.34, 33.33, 33.33])
  assert.deepEqual(distribuirParcelas(1200, 3), [400, 400, 400])
  assert.deepEqual(distribuirParcelas(400, 3, 'parcela'), [400, 400, 400])
  for (const n of [2, 3, 7, 12, 999]) {
    assert.equal(distribuirParcelas(1234.56, n).reduce((s, v) => s + Math.round(v * 100), 0), 123456)
  }
})
test('valores e quantidades inválidas não produzem parcelas', () => {
  for (const n of [0, 1, 1.5, 1000, NaN]) assert.deepEqual(distribuirParcelas(100, n), [])
  assert.deepEqual(distribuirParcelas(0.01, 2), [])
  assert.deepEqual(distribuirParcelas(Infinity, 2), [])
})
test('datas no fim do mês e na virada do ano permanecem na competência correta', () => {
  assert.equal(somarMeses('2026-01-31', 1), '2026-02-28')
  assert.equal(somarMeses('2024-01-31', 1), '2024-02-29')
  assert.equal(somarMeses('2026-12-31', 1), '2027-01-31')
  assert.equal(somarMeses('2026-01-31', -1), '2025-12-31')
})
