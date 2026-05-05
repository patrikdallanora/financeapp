import Dexie from 'dexie'
import { v4 as uuidv4 } from 'uuid'

export const db = new Dexie('FinanceAppDB')

db.version(1).stores({
  usuarios: '++id, uuid, nome, createdAt, updatedAt, deletedAt, syncStatus',

  cartoes:
    '++id, uuid, nome, ativo, updatedAt, deletedAt, syncStatus',

  lancamentos:
    '++id, uuid, tipo, usuarioId, dataCompetencia, dataPagamento, metodoPagamento, cartaoId, faturaRef, categoriaId, subcategoriaId, status, recorrente, recorrenciaId, parcelamentoId, updatedAt, deletedAt, syncStatus',

  faturas:
    '++id, uuid, cartaoId, faturaRef, status, updatedAt, syncStatus',

  categorias:
    '++id, uuid, nome, tipo, updatedAt, deletedAt, syncStatus',

  subcategorias:
    '++id, uuid, nome, categoriaId, updatedAt, deletedAt, syncStatus',

  metas:
    '++id, uuid, tipo, categoriaId, dataInicio, dataFim, ativo, updatedAt, deletedAt, syncStatus',

  syncLog:
    '++id, tabela, uuid, action, timestamp, deviceId, resolved'
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
    cor: '#0ea5e9',
    createdAt: agoraISO(),
    updatedAt: agoraISO(),
    deletedAt: null,
    syncStatus: 'pending'
  })

  await db.usuarios.add({
    uuid: gerarUUID(),
    nome: 'Grazi',
    cor: '#ec4899',
    createdAt: agoraISO(),
    updatedAt: agoraISO(),
    deletedAt: null,
    syncStatus: 'pending'
  })

  const categorias = [
    { nome: 'Alimentação', icone: '🍔', cor: '#f97316', tipo: 'despesa' },
    { nome: 'Transporte', icone: '🚗', cor: '#3b82f6', tipo: 'despesa' },
    { nome: 'Casa', icone: '🏠', cor: '#22c55e', tipo: 'despesa' },
    { nome: 'Saúde', icone: '💊', cor: '#ef4444', tipo: 'despesa' },
    { nome: 'Lazer', icone: '🎮', cor: '#a855f7', tipo: 'despesa' },
    { nome: 'Mercado', icone: '🛒', cor: '#eab308', tipo: 'despesa' },
    { nome: 'Assinaturas', icone: '📺', cor: '#6366f1', tipo: 'despesa' },
    { nome: 'Receitas', icone: '💰', cor: '#22c55e', tipo: 'receita' },
    { nome: 'Investimentos', icone: '📈', cor: '#0ea5e9', tipo: 'receita' },
    { nome: 'Cartão', icone: '💳', cor: '#64748b', tipo: 'despesa' },
    { nome: 'Outros', icone: '📦', cor: '#6b7280', tipo: 'ambos' }
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