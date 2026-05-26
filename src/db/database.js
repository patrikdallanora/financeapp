import Dexie from 'dexie'
import { v4 as uuidv4 } from 'uuid'

export const db = new Dexie('FinanceAppDB')

const schema = {
  usuarios: '++id, uuid, nome, createdAt, updatedAt, deletedAt, syncStatus',

  cartoes:
    '++id, uuid, nome, ativo, updatedAt, deletedAt, syncStatus',

  lancamentos:
    '++id, uuid, tipo, usuarioId, usuarioUuid, dataCompetencia, dataPagamento, metodoPagamento, cartaoId, cartaoUuid, faturaRef, categoriaId, categoriaUuid, subcategoriaId, subcategoriaUuid, status, recorrente, recorrenciaId, parcelamentoId, updatedAt, deletedAt, syncStatus',
  
  faturas:
    '++id, uuid, cartaoId, faturaRef, status, updatedAt, syncStatus',

  categorias:
    '++id, uuid, nome, tipo, updatedAt, deletedAt, syncStatus',

  subcategorias:
  '++id, uuid, nome, categoriaId, categoriaUuid, updatedAt, deletedAt, syncStatus',
  
  metas:
    '++id, uuid, nome, tipo, periodoTipo, mesReferencia, anoReferencia, dataInicio, dataFim, categoriaId, subcategoriaId, valorAlvo, mostrarNoDashboard, ativa, updatedAt, deletedAt, syncStatus',

  syncLog:
    '++id, tabela, uuid, action, timestamp, deviceId, resolved'
}

db.version(1).stores(schema)

db.version(2)
  .stores(schema)
  .upgrade(async (tx) => {
    const mapaLegado = {
      '🍔': 'utensils',
      '🚗': 'car',
      '🏠': 'home',
      '💊': 'health',
      '🎮': 'game',
      '🛒': 'shopping',
      '📺': 'tv',
      '💰': 'income',
      '📈': 'investments',
      '💳': 'card',
      '📦': 'package'
    }

    await tx.table('categorias').toCollection().modify((categoria) => {
      if (mapaLegado[categoria.icone]) {
        categoria.icone = mapaLegado[categoria.icone]
        categoria.updatedAt = new Date().toISOString()
        categoria.syncStatus = 'pending'
      }
    })
  })


db.version(3).stores(schema)

db.version(4)
  .stores(schema)
  .upgrade(async (tx) => {
    const categorias = await tx.table('categorias').toArray()
    const subcategorias = await tx.table('subcategorias').toArray()
    const cartoes = await tx.table('cartoes').toArray()
    const usuarios = await tx.table('usuarios').toArray()

    const mapaCategorias = new Map(
      categorias.map((item) => [Number(item.id), item.uuid])
    )

    const mapaSubcategorias = new Map(
      subcategorias.map((item) => [Number(item.id), item.uuid])
    )

    const mapaCartoes = new Map(
      cartoes.map((item) => [Number(item.id), item.uuid])
    )

    const mapaUsuarios = new Map(
      usuarios.map((item) => [Number(item.id), item.uuid])
    )

    await tx.table('lancamentos').toCollection().modify((lancamento) => {
      if (lancamento.categoriaId) {
        lancamento.categoriaUuid =
          mapaCategorias.get(Number(lancamento.categoriaId)) || null
      }

      if (lancamento.subcategoriaId) {
        lancamento.subcategoriaUuid =
          mapaSubcategorias.get(Number(lancamento.subcategoriaId)) || null
      }

      if (lancamento.cartaoId) {
        lancamento.cartaoUuid =
          mapaCartoes.get(Number(lancamento.cartaoId)) || null
      }

      if (lancamento.usuarioId) {
        lancamento.usuarioUuid =
          mapaUsuarios.get(Number(lancamento.usuarioId)) || null
      }

      lancamento.updatedAt = new Date().toISOString()
      lancamento.syncStatus = 'pending'
    })

    await tx.table('subcategorias').toCollection().modify((subcategoria) => {
  if (subcategoria.categoriaId) {
    subcategoria.categoriaUuid =
      mapaCategorias.get(Number(subcategoria.categoriaId)) || null
  }

  subcategoria.updatedAt = new Date().toISOString()
  subcategoria.syncStatus = 'pending'
})
  })

export const gerarUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return uuidv4()
}

export const agora = () => {
  return new Date().toISOString().slice(0, 10)
}

export const agoraISO = () => {
  return new Date().toISOString()
}

export const criarRegistroBase = () => ({
  uuid: gerarUUID(),
  updatedAt: agoraISO(),
  deletedAt: null,
  syncStatus: 'pending'
})

export const softDelete = async (tabela, id) => {
  const registro = await db[tabela].get(id)

  if (!registro) return

  await db[tabela].update(id, {
    deletedAt: agoraISO(),
    syncStatus: 'pending',
    updatedAt: agoraISO()
  })
}

db.on('populate', async () => {
  console.log('🌱 Criando dados iniciais...')

  await db.usuarios.add({
    uuid: gerarUUID(),
    nome: 'PK',
    cor: '#0F9D58',
    createdAt: agoraISO(),
    updatedAt: agoraISO(),
    deletedAt: null,
    syncStatus: 'pending'
  })

  await db.usuarios.add({
    uuid: gerarUUID(),
    nome: 'Grazi',
    cor: '#3AF2A1',
    createdAt: agoraISO(),
    updatedAt: agoraISO(),
    deletedAt: null,
    syncStatus: 'pending'
  })

  const categorias = [
    { nome: 'Alimentação', icone: 'utensils', cor: '#0F9D58', tipo: 'despesa' },
    { nome: 'Transporte', icone: 'car', cor: '#3AF2A1', tipo: 'despesa' },
    { nome: 'Casa', icone: 'home', cor: '#0F9D58', tipo: 'despesa' },
    { nome: 'Saúde', icone: 'health', cor: '#EF4444', tipo: 'despesa' },
    { nome: 'Lazer', icone: 'game', cor: '#A855F7', tipo: 'despesa' },
    { nome: 'Mercado', icone: 'shopping', cor: '#22C55E', tipo: 'despesa' },
    { nome: 'Assinaturas', icone: 'tv', cor: '#14B8A6', tipo: 'despesa' },
    { nome: 'Receitas', icone: 'income', cor: '#3AF2A1', tipo: 'receita' },
    { nome: 'Investimentos', icone: 'investments', cor: '#0F9D58', tipo: 'receita' },
    { nome: 'Cartão', icone: 'card', cor: '#64748B', tipo: 'despesa' },
    { nome: 'Outros', icone: 'package', cor: '#6B7280', tipo: 'ambos' }
  ]

  for (const categoria of categorias) {
    await db.categorias.add({
      ...criarRegistroBase(),
      nome: categoria.nome,
      icone: categoria.icone,
      cor: categoria.cor,
      tipo: categoria.tipo
    })
  }

  console.log('✅ Seed inicial concluído')
})

export const initDB = async () => {
  try {
    await db.open()
    console.log('📦 Banco iniciado com sucesso')
  } catch (err) {
    console.error('❌ Erro ao iniciar DB:', err)
    throw err
  }
}