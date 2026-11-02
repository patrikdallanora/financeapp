const indexBy = (rows, field) => {
  const result = new Map()
  for (const row of rows) {
    if (row[field] === undefined || row[field] === null || row[field] === '') continue
    const key = String(row[field])
    result.set(key, [...(result.get(key) || []), row])
  }
  return result
}
const one = rows => rows?.length === 1 ? rows[0] : null

// Audit a source exactly as captured. A global UUID lookup diagnoses a missing
// local catalog entry; it does not silently decide between versions or names.
export function auditCategoryLinks(snapshots) {
  const globalRows = snapshots.flatMap(s => s.tables.categorias || [])
  const globalByUuid = indexBy(globalRows, 'uuid')
  const globalNames = uuid => [...new Set((globalByUuid.get(String(uuid)) || []).map(r => r.nome))]
  const sources = []
  for (const snapshot of snapshots) {
    const categories = snapshot.tables.categorias || []
    const byUuid = indexBy(categories, 'uuid')
    const byId = indexBy(categories, 'id')
    const nameGroups = indexBy(categories, 'nome')
    const records = (snapshot.tables.lancamentos || []).map(record => {
      const explicit = record.categoriaUuid ? one(byUuid.get(String(record.categoriaUuid))) : null
      const legacy = record.categoriaId != null ? one(byId.get(String(record.categoriaId))) : null
      // Matches Dashboard/Metas' existing combined .find predicate.
      const displayed = categories.find(c => c.uuid === record.categoriaUuid || Number(c.id) === Number(record.categoriaId))
      const expectedNames = record.categoriaUuid ? globalNames(record.categoriaUuid) : []
      const issues = []
      if (record.categoriaUuid && !explicit) issues.push('uuid_missing_in_local_catalog')
      if (record.categoriaUuid && !expectedNames.length) issues.push('uuid_missing_in_all_catalogs')
      if (record.categoriaUuid && expectedNames.length > 1) issues.push('uuid_has_different_names')
      if (record.categoriaUuid && legacy && legacy.uuid !== record.categoriaUuid) issues.push('legacy_id_points_to_other_uuid')
      if (explicit && displayed && explicit.uuid !== displayed.uuid) issues.push('id_match_hides_uuid_match')
      if (expectedNames.length === 1 && displayed?.nome !== expectedNames[0]) issues.push('displayed_name_differs_from_uuid')
      if (!record.categoriaUuid && !legacy) issues.push('unresolved_legacy_category')
      const category = explicit || (!record.categoriaUuid ? legacy : null)
      const subcategories = (snapshot.tables.subcategorias || []).filter(sub => record.subcategoriaUuid
        ? sub.uuid === record.subcategoriaUuid : record.subcategoriaId != null && Number(sub.id) === Number(record.subcategoriaId))
      const subcategory = one(subcategories)
      if (subcategory?.categoriaUuid && category && subcategory.categoriaUuid !== category.uuid) issues.push('subcategory_parent_differs_from_launch_category')
      return { uuid: record.uuid, localId: record.id, deleted: Boolean(record.deletedAt), issues,
        storedCategoryUuid: record.categoriaUuid || null, localUuidName: explicit?.nome || null,
        legacyName: legacy?.nome || null, displayedName: displayed?.nome || null,
        expectedNamesFromUuid: expectedNames, subcategoryName: subcategory?.nome || null }
    })
    const typeCounts = {}
    const pairs = new Map()
    for (const record of records) {
      for (const issue of record.issues) typeCounts[issue] = (typeCounts[issue] || 0) + 1
      if (record.issues.includes('displayed_name_differs_from_uuid')) {
        const key = JSON.stringify([record.displayedName, record.expectedNamesFromUuid])
        const pair = pairs.get(key) || { displayed: record.displayedName, referencedByUuid: record.expectedNamesFromUuid[0], total: 0, active: 0 }
        pair.total++; if (!record.deleted) pair.active++
        pairs.set(key, pair)
      }
    }
    sources.push({ deviceId: snapshot.source.deviceId, label: snapshot.source.label,
      summary: { categories: categories.length, launches: records.length, activeLaunches: records.filter(r => !r.deleted).length,
        affectedLaunches: records.filter(r => r.issues.length).length, issueTypes: typeCounts },
      categoryCatalog: categories,
      duplicateNames: [...nameGroups].filter(([, rows]) => new Set(rows.map(r => r.uuid)).size > 1).map(([name, rows]) => ({ name, uuids: rows.map(r => r.uuid) })),
      nameDifferences: [...pairs.values()].sort((a, b) => b.total - a.total), records })
  }
  const crossDevice = []
  for (let i = 0; i < sources.length; i++) for (let j = i + 1; j < sources.length; j++) {
    const other = indexBy(sources[j].records, 'uuid')
    const differences = []
    for (const record of sources[i].records) {
      const peer = one(other.get(String(record.uuid)))
      if (peer && record.displayedName !== peer.displayedName) differences.push({ uuid: record.uuid,
        firstName: record.displayedName, secondName: peer.displayedName,
        firstUuid: record.storedCategoryUuid, secondUuid: peer.storedCategoryUuid })
    }
    crossDevice.push({ first: sources[i].label, second: sources[j].label, count: differences.length, differences })
  }
  return { sources, crossDevice }
}
