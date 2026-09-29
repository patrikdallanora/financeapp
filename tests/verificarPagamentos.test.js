import test from 'node:test'
import assert from 'node:assert/strict'
import { mesmoPagamento, compararPagamentos, podeReenviarPagamento, diferencasPagamento } from '../src/sync/verificarPagamentos.js'

const pago = {uuid:'a',descricao:'Aluguel',status:'pago',valor:2055.61,dataCompetencia:'2026-09-08',dataPagamento:'2026-09-08',metodoPagamento:'pix',syncStatus:'synced'}
test('confere pagamentos com tipos e datas equivalentes vindos da planilha', () => {
  assert.equal(mesmoPagamento(pago,{...pago,valor:'2.055,61',dataCompetencia:'2026-09-08T03:00:00.000Z',dataPagamento:'08/09/2026',faturaValorPago:'0',faturaFechada:'FALSE'}),true)
})
test('pagamento local e pendência remota são divergentes mesmo se marcados synced', () => {
  const divergencias = compararPagamentos([pago],[{...pago,status:'pendente',dataPagamento:null}])
  assert.equal(divergencias.length,1)
  assert.equal(divergencias[0].local.sincronizacao,'synced')
  assert.equal(divergencias[0].remoto.status,'pendente')
})
test('não confirma UUID ausente/duplicado nem baixa parcial diferente', () => {
  assert.equal(compararPagamentos([pago],[]).length,1)
  assert.equal(compararPagamentos([pago],[pago,pago]).length,1)
  assert.equal(mesmoPagamento({...pago,faturaValorPago:1757.93},{...pago,faturaValorPago:1569.81}),false)
  assert.equal(mesmoPagamento({...pago,faturaFechada:true},{...pago,faturaFechada:'FALSE'}),false)
})

test('reenvio limitado a baixa local mais recente, sem divergência de valor/referência', () => {
  const local = {...pago,tipo:'despesa',updatedAt:'2026-09-08T12:29:50Z'}
  const remoto = {...local,status:'pendente',dataPagamento:null,updatedAt:'2026-09-08T12:28:00Z'}
  assert.equal(podeReenviarPagamento(local,remoto),true)
  assert.equal(podeReenviarPagamento(local,{...remoto,valor:100}),false)
  assert.equal(podeReenviarPagamento(local,{...remoto,updatedAt:'2026-09-09T12:00:00Z'}),false)
  assert.equal(podeReenviarPagamento({...local,metodoPagamento:'cartao'},remoto),false)
  assert.equal(podeReenviarPagamento({...local,syncStatus:'conflict'},remoto),false)
  assert.deepEqual(diferencasPagamento(local,remoto).map(d=>d.campo),['status','dataPagamento'])
})