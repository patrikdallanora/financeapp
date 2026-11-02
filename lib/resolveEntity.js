// A shared UUID is authoritative. A device-local numeric ID may only be used
// for legacy records with no UUID, never to replace a missing UUID reference.
export function resolveEntity(rows = [], record = {}, prefix) {
  const uuid = record[`${prefix}Uuid`]
  const hasUuid = uuid !== undefined && uuid !== null && uuid !== ''
  const id = record[`${prefix}Id`]
  if (!hasUuid && (id === undefined || id === null || id === '' || !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) return undefined
  const candidates = rows.filter(row => hasUuid ? row.uuid === uuid : Number(row.id) === Number(id))
  return candidates.length === 1 ? candidates[0] : undefined
}
