import { encode } from './backupCodec.js'

const equal = (a, b) => JSON.stringify(encode(a)) === JSON.stringify(encode(b))
const label = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
const uniqueByUuid = rows => {
  const map = new Map()
  for (const row of rows) {
    if (!row.uuid || map.has(row.uuid)) throw new Error('Catálogo de categorias com identidade ausente ou duplicada.')
    map.set(row.uuid, row)
  }
  return map
}

export function planCategoryRepair(snapshot, fullCatalog) {
  if (!Array.isArray(fullCatalog) || !fullCatalog.length) throw new Error('Catálogo completo não recebido.')
  const originals = snapshot.tables
  const categories = (originals.categorias || []).map(row => ({ ...row }))
  const localByUuid = uniqueByUuid(categories)
  const remoteByUuid = uniqueByUuid(fullCatalog)
  let nextId = Math.max(0, ...categories.map(row => Number(row.id) || 0)) + 1
  for (const remote of [...remoteByUuid.values()].sort((a, b) => a.uuid.localeCompare(b.uuid))) {
    const existing = localByUuid.get(remote.uuid)
    if (existing) {
      for (const field of ['nome', 'tipo', 'icone', 'cor']) {
        if (String(existing[field] ?? '') !== String(remote[field] ?? '')) throw new Error('Uma categoria mudou desde o backup. A correção foi interrompida para revisão.')
      }
    } else {
      const { id, ...data } = remote
      const inserted = { ...data, id: nextId++ }
      categories.push(inserted)
      localByUuid.set(inserted.uuid, inserted)
    }
  }
  const subcategories = (originals.subcategorias || []).map(row => ({ ...row }))
  const subByUuid = uniqueByUuid(subcategories)
  const pending = []
  for (const sub of subcategories) {
    let targetUuid = sub.categoriaUuid
    if (!targetUuid && sub.categoriaId != null && sub.categoriaId !== '') {
      const originalParents = (originals.categorias || []).filter(c => Number(c.id) === Number(sub.categoriaId))
      if (originalParents.length === 1) targetUuid = originalParents[0].uuid
    }
    if (['lavagem', 'ipva'].includes(label(sub.nome))) {
      const cars = categories.filter(c => label(c.nome) === 'carro' && !c.deletedAt)
      if (cars.length !== 1) throw new Error('A categoria Carro não é inequívoca no catálogo.')
      targetUuid = cars[0].uuid
    } else {
      const referencedParents = [...new Set((originals.lancamentos || [])
        .filter(row => row.subcategoriaUuid === sub.uuid && row.categoriaUuid)
        .map(row => row.categoriaUuid))]
      if (referencedParents.length === 1 && referencedParents[0] !== targetUuid) {
        const current = localByUuid.get(targetUuid)
        const referenced = localByUuid.get(referencedParents[0])
        // Same label alone is insufficient: require a unique parent referenced
        // by all captured launches for this exact subcategory UUID as well.
        if (current && referenced && label(current.nome) === label(referenced.nome)) targetUuid = referenced.uuid
      }
    }
    if (!targetUuid) {
      const candidates = categories.filter(c => Number(c.id) === Number(sub.categoriaId))
      if (candidates.length === 1) targetUuid = candidates[0].uuid
    }
    const parent = localByUuid.get(targetUuid)
    if (!parent) throw new Error('Vínculo de subcategoria sem categoria conhecida. Nenhum dado foi alterado.')
    sub.categoriaUuid = parent.uuid
    sub.categoriaId = parent.id
  }
  const approvedMealRows = (originals.lancamentos || []).filter(row => {
    const sub = subByUuid.get(row.subcategoriaUuid)
    return label(row.descricao) === 'agua' && label(sub?.nome) === 'casal'
      && label(localByUuid.get(row.categoriaUuid)?.nome) === 'outros'
      && label(localByUuid.get(sub?.categoriaUuid)?.nome) === 'refeicao livre'
  })
  if (approvedMealRows.length > 1) throw new Error('Há mais de um lançamento Água com essa classificação. A correção precisa de revisão.')
  const approvedReclassificationUuids = approvedMealRows.map(row => row.uuid)
  const launches = (originals.lancamentos || []).map(original => {
    const row = { ...original }
    // Explicit user clarification: the captured Água / Casal entry is a meal
    // purchase. Do not classify any other description automatically.
    if (approvedReclassificationUuids.includes(row.uuid)) row.categoriaUuid = subByUuid.get(row.subcategoriaUuid).categoriaUuid
    if (row.categoriaUuid) {
      const category = localByUuid.get(row.categoriaUuid)
      if (!category) throw new Error('Um lançamento referencia categoria desconhecida. Nenhum dado foi alterado.')
      row.categoriaId = category.id
    }
    if (row.subcategoriaUuid) {
      const subcategory = subByUuid.get(row.subcategoriaUuid)
      if (!subcategory) throw new Error('Um lançamento referencia subcategoria desconhecida. Nenhum dado foi alterado.')
      row.subcategoriaId = subcategory.id
    }
    return row
  })
  const result = { categorias: categories, subcategorias: subcategories, lancamentos: launches }
  for (const row of launches) {
    const sub = subByUuid.get(row.subcategoriaUuid)
    if (sub && row.categoriaUuid && sub.categoriaUuid !== row.categoriaUuid) {
      pending.push({ launchUuid: row.uuid, subcategoryUuid: sub.uuid, reason: 'launch_subcategory_parent_mismatch' })
    }
  }
  return { tables: result, pending, approvedReclassificationUuids,
    summary: { addedCategories: categories.length - (originals.categorias || []).length,
      repairedSubcategories: subcategories.filter((row, i) => !equal(row, originals.subcategorias[i])).length,
      repairedLaunches: launches.filter((row, i) => !equal(row, originals.lancamentos[i])).length,
      approvedReclassifications: approvedReclassificationUuids.length,
      launchesPreserved: launches.length } }
}

export async function applyCategoryRepair(db, snapshot, fullCatalog) {
  const planned = planCategoryRepair(snapshot, fullCatalog)
  const names = ['categorias', 'subcategorias', 'lancamentos']
  await db.transaction('rw', names.map(name => db.table(name)), async () => {
    for (const name of names) {
      if (!equal(await db.table(name).toArray(), snapshot.tables[name])) throw new Error('Os dados mudaram durante a correção. Nenhuma alteração foi aplicada.')
    }
    // Only add catalog rows and replace the validated reference fields. No
    // clear/delete, no monetary fields, no payment state or timestamps touched.
    for (const row of planned.tables.categorias) {
      if (!snapshot.tables.categorias.some(old => old.uuid === row.uuid)) await db.categorias.add(row)
    }
    for (const row of planned.tables.subcategorias) {
      await db.subcategorias.update(row.id, { categoriaId: row.categoriaId, categoriaUuid: row.categoriaUuid })
    }
    for (const row of planned.tables.lancamentos) {
      const changes = {}
      if (row.categoriaUuid) changes.categoriaId = row.categoriaId
      if (planned.approvedReclassificationUuids.includes(row.uuid)) changes.categoriaUuid = row.categoriaUuid
      if (row.subcategoriaUuid) changes.subcategoriaId = row.subcategoriaId
      if (Object.keys(changes).length) await db.lancamentos.update(row.id, changes)
    }
  })
  return planned
}
