import test from 'node:test'
import assert from 'node:assert/strict'
import { mesAnterior, selecionarLancamentosMes, resumirMes, compararCategorias, variacaoMensal, avaliarComparacao } from '../src/utils/comparacaoMensal.js'
const categorias=[{id:1,uuid:'c1',nome:'Casa'},{id:2,uuid:'c2',nome:'Reembolsos'},{id:3,uuid:'c3',nome:'Lazer'}]
test('mês imediatamente anterior, inclusive virada do ano',()=>{
 assert.equal(mesAnterior('2026-01'),'2025-12');assert.equal(mesAnterior('2026-09'),'2026-08')
})
test('cartão usa fatura; outros usam competência; exclui reembolsos e deletados',()=>{
 const base={tipo:'despesa',categoriaId:1,valor:100,dataCompetencia:'2026-08-12'}
 const dados=[{...base,uuid:'1',metodoPagamento:'cartao',faturaRef:'2026-09'}, {...base,uuid:'2'}, {...base,uuid:'3',dataCompetencia:'2026-09-12'}, {...base,uuid:'4',dataCompetencia:'2026-09-12',deletedAt:'2026-09-20'}, {...base,uuid:'5',dataCompetencia:'2026-09-12',categoriaUuid:'c2'}, {...base,uuid:'6',metodoPagamento:'cartao',dataCompetencia:'2026-09-12',faturaRef:'2026-10'}]
 assert.deepEqual(selecionarLancamentosMes(dados,categorias,'2026-09').map(i=>i.uuid),['1','3'])
})
test('saldo e totais com precisão de centavos; ausência não é histórico zero',()=>{
 assert.deepEqual(resumirMes([{tipo:'receita',valor:.3},{tipo:'despesa',valor:.1},{tipo:'despesa',valor:.2}]),{receita:.3,despesa:.3,saldo:0,temDados:true})
 assert.equal(resumirMes([]).temDados,false)
})
test('categorias incluem as do mês anterior, com zero atual e participação correta',()=>{
 const atual=[{tipo:'despesa',categoriaUuid:'c1',valor:200}]
 const anterior=[{tipo:'despesa',categoriaUuid:'c1',valor:100},{tipo:'despesa',categoriaUuid:'c3',valor:50}]
 const r=compararCategorias(atual,anterior,categorias)
 assert.equal(r.length,2);assert.equal(r[0].total,200);assert.equal(r[0].percentual,100);assert.equal(r[0].anterior,100);assert.equal(r[1].total,0);assert.equal(r[1].anterior,50)
})
test('percentuais lidam com ausência, base zero e saldo negativo',()=>{
 assert.equal(variacaoMensal(100,0,false),'Sem histórico');assert.equal(variacaoMensal(100,0),'Sem base percentual');assert.equal(variacaoMensal(0,0),'Sem variação');assert.equal(variacaoMensal(100,-100),'+200%');assert.equal(variacaoMensal(-200,-100),'-100%')
})

test('melhora e piora seguem o significado financeiro, inclusive saldos negativos e base zero',()=>{
 assert.equal(avaliarComparacao(80,100,'despesa'),'melhor')
 assert.equal(avaliarComparacao(120,100,'despesa'),'pior')
 assert.equal(avaliarComparacao(80,100,'receita'),'pior')
 assert.equal(avaliarComparacao(120,100,'receita'),'melhor')
 assert.equal(avaliarComparacao(-80,-100,'saldo'),'melhor')
 assert.equal(avaliarComparacao(-120,-100,'saldo'),'pior')
 assert.equal(avaliarComparacao(0,0,'saldo'),'neutro')
 assert.equal(avaliarComparacao(50,0,'receita'),'melhor')
 assert.equal(avaliarComparacao(50,0,'despesa'),'pior')
 assert.equal(avaliarComparacao(50,0,'receita',false),'neutro')
})
