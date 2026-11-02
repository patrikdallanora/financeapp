import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveEntity } from '../lib/resolveEntity.js'
import { compararCategorias } from '../src/utils/comparacaoMensal.js'

test('UUID prevalece sobre ID local de outra categoria em qualquer ordem', () => {
  const rows = [{ id: 2, uuid: 'transport', nome: 'Transporte' }, { id: 20, uuid: 'car', nome: 'Carro' }]
  const launch = { categoriaId: 2, categoriaUuid: 'car' }
  assert.equal(resolveEntity(rows, launch, 'categoria').nome, 'Carro')
  assert.equal(resolveEntity([...rows].reverse(), launch, 'categoria').nome, 'Carro')
  assert.equal(resolveEntity(rows.slice(0, 1), launch, 'categoria'), undefined)
})

test('aceita legado inequívoco, mas não adivinha identidade ambígua ou nula', () => {
  const rows = [{ id: 1, uuid: 'a' }, { id: 2, uuid: 'b' }]
  assert.equal(resolveEntity(rows, { categoriaId: '2' }, 'categoria').uuid, 'b')
  assert.equal(resolveEntity(rows, { categoriaId: 1, categoriaUuid: 'missing' }, 'categoria'), undefined)
  assert.equal(resolveEntity([...rows, { id: 2, uuid: 'c' }], { categoriaId: 2 }, 'categoria'), undefined)
  assert.equal(resolveEntity(rows, { categoriaId: '' }, 'categoria'), undefined)
  assert.equal(resolveEntity([{ id: 1, uuid: 'a' }, { id: 2, uuid: 'a' }], { categoriaUuid: 'a' }, 'categoria'), undefined)
})

test('comparativo financeiro não reclassifica um UUID ausente usando ID local', () => {
  const categories = [{ id: 1, uuid: 'wrong', nome: 'Outros' }]
  const launches = [{ tipo: 'despesa', valor: 100, categoriaId: 1, categoriaUuid: 'missing' }]
  const groups = compararCategorias(launches, [], categories)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].nome, 'Categoria indisponível')
  assert.equal(groups[0].total, 100)
  assert.equal(groups[0].referenciaNaoResolvida, true)
})
