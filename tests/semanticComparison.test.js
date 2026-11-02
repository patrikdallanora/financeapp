import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeBusinessRecord } from '../src/backup/semanticComparison.js'

test('compara formatos sem reescrever fontes ou confundir vazio com pagamento confirmado', () => {
  const local = { id: 1, uuid: 'a', valor: 2055.61, dataPagamento: '2026-09-08', deletedAt: null, status: 'pago' }
  const sheet = { id: 99, uuid: 'a', valor: '2.055,61', dataPagamento: 46273, deletedAt: '',
    faturaValorPago: '0', faturaFechada: 'FALSE', parcelaAtual: '', totalParcelas: 0, status: 'pago' }
  const before = JSON.stringify([local, sheet])
  assert.deepEqual(normalizeBusinessRecord(local), normalizeBusinessRecord(sheet))
  assert.equal(JSON.stringify([local, sheet]), before)
  assert.notDeepEqual(normalizeBusinessRecord(local), normalizeBusinessRecord({ ...sheet, status: 'pendente' }))
})

test('mantém divergências reais de valor, identidade, nome, exclusão e pagamento parcial', () => {
  const record = { valor: 100, categoriaUuid: 'cat-a', nome: 'Casa', faturaValorPago: 30 }
  for (const change of [{ valor: 101 }, { categoriaUuid: 'cat-b' }, { nome: 'Carro' },
    { deletedAt: '2026-09-01' }, { faturaValorPago: 40 }, { dataPagamento: '2026-09-08' }]) {
    assert.notDeepEqual(normalizeBusinessRecord(record), normalizeBusinessRecord({ ...record, ...change }))
  }
})
