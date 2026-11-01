import { encode } from './backupCodec.js'

const businessTables = ['usuarios', 'cartoes', 'categorias', 'subcategorias', 'lancamentos', 'faturas', 'metas']
const relations = { usuario: 'usuarios', cartao: 'cartoes', categoria: 'categorias', subcategoria: 'subcategorias' }
const transportFields = new Set(['id', 'updatedAt', 'syncStatus', 'lastSyncedAt', 'envioIncerto'])
const stable = value => {
  if (value instanceof Date) return value
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
  return value
}

// Conservative report, never a merge. Every source version is retained, even
// when local IDs match another device or the same UUID has different names.
export function reconcileSnapshots(snapshots) {
  const issues = []
  const groups = new Map()
  const sourceIds = new Set()
  for (const snapshot of snapshots) {
    const source = snapshot.source.deviceId
    // Initial/current exports of one phone need separate source version IDs.
    const sourceVersion = `${source}@${snapshot.createdAt}`
    if (sourceIds.has(sourceVersion)) throw new Error('Snapshot repetido na comparação. Use cada arquivo apenas uma vez.')
    sourceIds.add(sourceVersion)
    for (const table of businessTables) {
      if (!Array.isArray(snapshot.tables[table])) issues.push({ type: 'missing_table', sourceVersion, table })
      const rows = snapshot.tables[table] || []
      const seen = new Set()
      for (const [ordinal, record] of rows.entries()) {
        const uuid = record.uuid ? String(record.uuid) : null
        if (!uuid) issues.push({ type: 'missing_uuid', sourceVersion, table, ordinal })
        if (uuid && seen.has(uuid)) issues.push({ type: 'duplicate_uuid', sourceVersion, table, uuid })
        seen.add(uuid)
        const key = uuid ? `${table}:${uuid}` : `${table}:unidentified:${sourceVersion}:${ordinal}`
        const canonical = { ...record }
        for (const field of transportFields) delete canonical[field]
        for (const [prefix, target] of Object.entries(relations)) {
          const id = record[`${prefix}Id`]
          const explicitUuid = record[`${prefix}Uuid`]
          if (!explicitUuid && (id === null || id === undefined || id === '')) continue
          const candidates = (snapshot.tables[target] || []).filter(item => String(item.id) === String(id))
          const explicitTargets = (snapshot.tables[target] || []).filter(item => item.uuid === explicitUuid)
          if (explicitUuid) {
            if (explicitTargets.length !== 1) issues.push({ type: 'unresolved_uuid_relation', sourceVersion, table, uuid, relation: prefix })
            if (candidates.length === 1 && candidates[0].uuid !== explicitUuid) {
              issues.push({ type: 'uuid_id_relation_mismatch', sourceVersion, table, uuid, relation: prefix })
            }
          } else if (candidates.length === 1 && candidates[0].uuid) {
            canonical[`${prefix}Uuid`] = candidates[0].uuid
          } else {
            issues.push({ type: 'unresolved_legacy_relation', sourceVersion, table, uuid, relation: prefix })
            // Keep source in the key: an unresolved ID must not falsely compare
            // equal to the same number on another phone.
            canonical[`${prefix}Unresolved`] = { sourceVersion, id }
          }
          delete canonical[`${prefix}Id`]
        }
        const entries = groups.get(key) || []
        entries.push({ sourceVersion, sourceLabel: snapshot.source.label, table, ordinal, original: record,
          comparison: encode(stable(canonical)) })
        groups.set(key, entries)
      }
    }
  }
  const entries = [...groups.entries()].map(([key, versions]) => {
    const equal = new Set(versions.map(item => JSON.stringify(item.comparison))).size === 1
    if (!equal) issues.push({ type: 'different_values', key, sources: versions.map(item => item.sourceVersion) })
    return { key, state: !equal ? 'different' : versions.length === 1 ? 'single_source' : 'equal', versions }
  })
  return { sourceCount: sourceIds.size, records: entries, issues,
    summary: { sourceRecords: entries.reduce((n, entry) => n + entry.versions.length, 0),
      identities: entries.length, different: entries.filter(entry => entry.state === 'different').length,
      singleSource: entries.filter(entry => entry.state === 'single_source').length,
      issues: issues.length } }
}
