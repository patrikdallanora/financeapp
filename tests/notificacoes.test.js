import test from 'node:test'
import assert from 'node:assert/strict'
import { calcularAlertas, hojeISO } from '../lib/alertasFinanceiros.js'
import { confirmarRegistroEnviado } from '../src/sync/confirmarRegistroEnviado.js'

const cartoes = [{ id: 1, uuid: 'cartao-1', nome: 'Teste', diaVencimento: 28 }]
const compra = (dados = {}) => ({ tipo: 'despesa', metodoPagamento: 'cartao',
  cartaoUuid: 'cartao-1', faturaRef: '2026-09', valor: 100, status: 'pendente', ...dados })
const alerta = (lancamentos) => calcularAlertas({ lancamentos, cartoes }, '2026-09-28')

test('fatura quitada em um item encerra o grupo, como no extrato', () => {
  assert.equal(alerta([compra({ faturaFechada: 'TRUE', status: 'pago' }), compra()]).deveNotificar, false)
})
test('pagamento acumulado cobre a fatura inteira', () => {
  assert.equal(alerta([compra({ faturaValorPago: 200 }), compra()]).deveNotificar, false)
})
test('pagamento parcial maior que cada compra ainda deixa saldo da fatura', () => {
  const resultado = alerta([compra({ faturaValorPago: 150 }), compra({ faturaValorPago: 150 })])
  assert.equal(resultado.resumo.faturasVencendoProximosDias, 1)
  assert.match(resultado.corpo, /50,00/)
  assert.doesNotMatch(resultado.corpo, /200,00/)
})
test('pagamento parcial menor que cada compra é subtraído apenas uma vez', () => {
  assert.match(alerta([compra({ faturaValorPago: 40 }), compra({ faturaValorPago: 40 })]).corpo, /160,00/)
})
test('compras pagas por status não reaparecem e centavos não deixam resíduos', () => {
  assert.equal(alerta([compra({ status: ' pago ' })]).deveNotificar, false)
  assert.equal(alerta([compra({ valor: 0.1, faturaValorPago: 0.3 }), compra({ valor: 0.2 })]).deveNotificar, false)
})
test('UUID e ID do mesmo cartão e referência ISO pertencem à mesma fatura', () => {
  assert.equal(alerta([compra({ faturaFechada: true }), compra({ cartaoUuid: null, cartaoId: 1, faturaRef: '2026-09-01T00:00:00.000Z' })]).deveNotificar, false)
})
test('exclusões, outros meses e outros cartões não contaminam a fatura', () => {
  const resultado = alerta([compra(), compra({ deletedAt: '2026-09-20', faturaFechada: true }), compra({ faturaRef: '2026-08', faturaFechada: true }), compra({ cartaoUuid: 'outro', faturaFechada: true })])
  assert.equal(resultado.resumo.faturasVencendoProximosDias, 1)
  assert.match(resultado.corpo, /100,00/)
})
test('despesas pagas, excluídas e receitas não geram cobrança', () => {
  const despesa = compra({ metodoPagamento: 'pix', dataCompetencia: '2026-09-28' })
  assert.equal(alerta([{ ...despesa, status: 'pago' }, { ...despesa, dataPagamento: '28/09/2026' }, { ...despesa, deletedAt: '2026-09-27' }, { ...despesa, tipo: 'receita' }]).deveNotificar, false)
})
test('despesas realmente pendentes respeitam hoje, atrasadas e próximos cinco dias', () => {
  const resultado = alerta(['2026-09-27', '2026-09-28', '2026-10-03', '2026-10-04'].map((dataCompetencia) => compra({ metodoPagamento: 'pix', dataCompetencia })))
  assert.deepEqual(resultado.resumo, { vencidas: 1, vencendoHoje: 1, vencendoProximosDias: 1, faturasVencidas: 0, faturasVencendoProximosDias: 0 })
})
test('data de São Paulo independe do fuso do servidor', () => {
  assert.equal(hojeISO(new Date('2026-09-29T01:00:00Z')), '2026-09-28')
  assert.equal(hojeISO(new Date('2026-09-29T12:00:00Z')), '2026-09-29')
})
test('confirma envio sem alteração posterior', () => {
  const enviado = { uuid: '1', status: 'pendente', syncStatus: 'pending', updatedAt: '2026-09-28' }
  const local = { ...enviado }
  confirmarRegistroEnviado(local, enviado, 'agora')
  assert.equal(local.syncStatus, 'synced')
  assert.equal(local.lastSyncedAt, 'agora')
})
test('pagamento durante o envio continua pendente de sincronização, inclusive no mesmo timestamp', () => {
  const enviado = { uuid: '1', status: 'pendente', syncStatus: 'pending', updatedAt: '2026-09-28' }
  const local = { ...enviado, status: 'pago' }
  confirmarRegistroEnviado(local, enviado, 'agora')
  assert.equal(local.syncStatus, 'pending')
  assert.equal(local.status, 'pago')
  assert.equal(local.lastSyncedAt, undefined)
})
test('conflitos não são marcados como sincronizados', () => {
  const local = { uuid: '1', syncStatus: 'conflict' }
  confirmarRegistroEnviado(local, { ...local, syncStatus: 'pending' }, 'agora')
  assert.equal(local.syncStatus, 'conflict')
})
