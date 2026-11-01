export const BACKUP_FORMAT = 'financeapp-device-backup'
export const BACKUP_VERSION = 1

// Tagged values preserve Dates, undefined and non-finite numbers without losing
// unknown fields or confusing a user object with a serialization marker.
export function encode(value) {
  if (value === undefined) return ['undefined']
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return ['scalar', value]
  if (typeof value === 'number') return ['number', Object.is(value, -0) ? '-0' : String(value)]
  if (value instanceof Date) return ['date', value.toISOString()]
  if (Array.isArray(value)) return ['array', value.map(encode)]
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return ['object', Object.entries(value).map(([key, v]) => [key, encode(v)])]
  }
  throw new Error('Tipo de dado não suportado no backup. Os dados originais foram preservados.')
}

export function decode(node) {
  if (!Array.isArray(node)) throw new Error('Backup com valor inválido.')
  const [type, value] = node
  if (type === 'undefined') return undefined
  if (type === 'scalar') return value
  if (type === 'number') return value === '-0' ? -0 : Number(value)
  if (type === 'date') return new Date(value)
  if (type === 'array') return value.map(decode)
  if (type === 'object') return Object.fromEntries(value.map(([key, v]) => [key, decode(v)]))
  throw new Error('Backup com tipo desconhecido.')
}

export async function sha256(text, cryptoApi = globalThis.crypto) {
  const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('')
}

export async function sealBackup(snapshot, cryptoApi) {
  const payload = JSON.stringify(encode(snapshot))
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, algorithm: 'SHA-256',
    sha256: await sha256(payload, cryptoApi), payload }
}

export async function openBackup(envelope, cryptoApi) {
  if (envelope?.format !== BACKUP_FORMAT || envelope.version !== BACKUP_VERSION ||
      envelope.algorithm !== 'SHA-256' || typeof envelope.payload !== 'string' ||
      await sha256(envelope.payload, cryptoApi) !== envelope.sha256) {
    throw new Error('Arquivo de backup inválido ou alterado. Nenhum dado foi restaurado.')
  }
  const snapshot = decode(JSON.parse(envelope.payload))
  if (!snapshot?.source?.deviceId || !snapshot.tables || !snapshot.counts || !Array.isArray(snapshot.tableNames)) {
    throw new Error('Manifesto de backup incompleto.')
  }
  for (const name of snapshot.tableNames) {
    if (!Array.isArray(snapshot.tables[name]) || snapshot.tables[name].length !== snapshot.counts[name]) {
      throw new Error(`Contagem inválida no backup: ${name}.`)
    }
  }
  return snapshot
}

// Deliberate allowlist: never export sessions, PINs, WebAuthn credentials,
// notification keys or the full localStorage.
export function captureSyncMetadata(storage, tables) {
  const keys = ['financeapp_device_id', 'financeapp_recuperacao_pagamentos_v1',
    'financeapp_sync_meta_local', 'financeapp_ultimo_pull_inicial',
    ...tables.map(name => `financeapp_ultimo_pull_${name}`)]
  return Object.fromEntries(keys.flatMap(key => {
    const value = storage.getItem(key)
    return value === null ? [] : [[key, value]]
  }))
}
