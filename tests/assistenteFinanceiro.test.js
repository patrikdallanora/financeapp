import test from 'node:test'
import assert from 'node:assert/strict'
import { prepararDados, calcularConsulta, mesFinanceiro } from '../lib/assistenteFinanceiro.js'
import { responderConsulta, interpretarConsulta } from '../lib/interpretarConsulta.js'

const plano = extra => ({ meses: ['2026-10'], tipo: 'despesa', categorias: [], excluirCategorias: [], descricoes: [], excluirDescricoes: [], grupo: 'todos', agrupamento: 'categorias', ordem: 'valor', beneficiario: null, esclarecimento: null, ...extra })
const categorias = [{ uuid: 'casa', id: 1, nome: 'Casa' }, { uuid: 'saude', id: 2, nome: 'Saúde' }, { uuid: 'mercado', id: 3, nome: 'Mercado' }, { uuid: 'reembolso', id: 4, nome: 'Reembolso' }]
const registro = (uuid, extra = {}) => ({ uuid, tipo: 'despesa', descricao: uuid, valor: 10.1, dataCompetencia: '2026-10-12', categoriaUuid: 'mercado', ...extra })

test('mês da fatura e competência aceitam serial, ISO e mês puro; categoria UUID prevalece', () => {
  assert.equal(mesFinanceiro(46327), '2026-11')
  const dados = prepararDados([registro('a', { metodoPagamento: 'cartao', faturaRef: 46296, dataCompetencia: '2026-09-01', categoriaId: 1 }), registro('b', { metodoPagamento: 'cartao', faturaRef: '2026-11' }), registro('c', { deletedAt: 'hoje' })], categorias)
  assert.equal(dados[0].categoria, 'Mercado')
  assert.equal(calcularConsulta(dados, plano()).quantidade, 1)
  assert.equal(dados.length, 2)
})
test('separa parcelas, recorrências e avulsos em centavos sem duplicar tipos por categoria', () => {
  const dados = prepararDados([registro('p', { totalParcelas: 4, parcelaAtual: 2, recorrente: true }), registro('f', { recorrente: true, categoriaUuid: 'saude' }), registro('a'), registro('a2', { categoriaUuid: 'saude', valor: 0.2 }), registro('r', { categoriaUuid: 'reembolso' })], categorias)
  const r = calcularConsulta(dados, plano({ agrupamento: 'tipo' }))
  assert.equal(r.totalCentavos, 3050)
  assert.equal(r.linhas.length, 3)
  assert.equal(r.linhas.find(l => l.nome === 'avulsos').centavos, 1030)
  assert.equal(calcularConsulta(dados, plano({ grupo: 'fixos' })).quantidade, 1)
})
test('preserva recorte explícito e não exclui descrição de outra categoria por inferência', () => {
  const dados = prepararDados([registro('c', { categoriaUuid: 'casa' }), registro('x', { descricao: 'Aluguel carro', categoriaUuid: 'saude' }), registro('y')], categorias)
  const p = plano({ excluirCategorias: ['Casa'], excluirDescricoes: ['Aluguel carro'] })
  assert.equal(calcularConsulta(dados, p).totalCentavos, 1010)
  assert.throws(() => calcularConsulta(dados, plano({ categorias: ['Categoria inventada'] })))
  assert.throws(() => prepararDados([registro('a'), registro('a')], categorias))
  assert.throws(() => prepararDados([registro('a', { dataCompetencia: '' })], categorias))
})
test('ordem de término agrupa duas parcelas do mesmo mês sem ocultar compras distintas', () => {
  const dados = prepararDados([registro('a', { descricao: 'Ração', parcelaAtual: 1, totalParcelas: 2, parcelamentoId: 'p' }), registro('b', { descricao: 'Ração', parcelaAtual: 2, totalParcelas: 2, parcelamentoId: 'p' }), registro('c', { descricao: 'Tênis', parcelaAtual: 1, totalParcelas: 4, parcelamentoId: 'q' }), registro('d', { descricao: 'Tênis', parcelaAtual: 2, totalParcelas: 3, parcelamentoId: 'z' })], categorias)
  const r = calcularConsulta(dados, plano({ grupo: 'parcelados', agrupamento: 'parcelas', ordem: 'termino' }))
  assert.deepEqual(r.linhas.map(l => l.restantes), [0, 1, 3])
  assert.equal(r.linhas[0].centavos, 2020)
  assert.equal(r.totalCentavos, 4040)
})



test('conversa local mantém mês e exclusões, separa tipos e detalha avulsos e parcelas', () => {
  const hoje = new Date('2026-10-22T15:00:00Z')
  const cats = [...categorias, {uuid:'carro',nome:'Carro'}, {uuid:'inv',nome:'Investimentos'}, {uuid:'casamento',nome:'Casamento'}]
  const dados = prepararDados([registro('c', {categoriaUuid:'casa'}), registro('car', {categoriaUuid:'carro'}), registro('i', {categoriaUuid:'inv'}), registro('al', {descricao:'Aluguel carro',categoriaUuid:'casamento',valor:100}), registro('p', {totalParcelas:4,parcelaAtual:2,valor:30}), registro('f', {recorrente:true,valor:20}), registro('a', {valor:50}), registro('outro', {dataCompetencia:'2026-11-01',valor:999})], cats)
  let r = responderConsulta('Quanto gastei em outubro sem carro, casa e investimento?', dados, null, hoje)
  assert.equal(r.resultado.totalCentavos, 20000)
  r = responderConsulta('Retire também Aluguel carro', dados, r.plano, hoje)
  assert.equal(r.resultado.totalCentavos, 10000)
  assert.equal(r.plano.excluirCategorias.includes('Carro'), true)
  r = responderConsulta('Desses, quanto é de compras parceladas, gastos fixos e avulsos?', dados, r.plano, hoje)
  assert.equal(r.resultado.linhas.length, 3)
  r = responderConsulta('Detalhe os gastos avulsos', dados, r.plano, hoje)
  assert.equal(r.resultado.totalCentavos, 5000)
  r = responderConsulta('Detalhe as parceladas que estão mais perto de vencer', dados, r.plano, hoje)
  assert.equal(r.resultado.totalCentavos, 3000)
  assert.equal(r.plano.ordem, 'termino')
  assert.equal(r.plano.meses[0], '2026-10')
})

test('categorias prevalecem sobre descrições iguais; perguntas fora do escopo pedem reformulação', () => {
  const dados = prepararDados([registro('a', {descricao:'Mercado'}), registro('b', {descricao:'Saidel'})], categorias)
  const hoje = new Date('2026-10-22T15:00:00Z')
  const r = responderConsulta('Detalhe mercado em outubro', dados, null, hoje)
  assert.equal(r.resultado.quantidade, 2)
  assert.ok(interpretarConsulta('qual é a previsão de juros?', dados, null, hoje).esclarecimento)
  assert.ok(interpretarConsulta('desses, detalhe', dados, null, hoje).esclarecimento)
  assert.ok(interpretarConsulta('quanto gastei sem categoria inventada?', dados, null, hoje).esclarecimento)
  assert.ok(interpretarConsulta('oi tudo bem', dados, null, hoje).esclarecimento)
  assert.deepEqual(interpretarConsulta('Compare setembro e outubro de 2026', dados, null, hoje).plano.meses, ['2026-09','2026-10'])
})
