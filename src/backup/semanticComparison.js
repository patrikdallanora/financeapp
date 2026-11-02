import { decode, encode } from './backupCodec.js'

const money = new Set(['valor', 'limite', 'valorAlvo', 'faturaValorPago'])
const numeric = new Set(['diaFechamento', 'diaVencimento', 'parcelaAtual', 'totalParcelas', 'anoReferencia'])
const booleans = new Set(['recorrente', 'faturaFechada', 'ativo', 'ativa', 'mostrarNoDashboard'])
const dates = new Set(['dataCompetencia', 'dataPagamento', 'dataInicio', 'dataFim'])
const audit = new Set(['createdAt', 'updatedAt', 'lastSyncedAt', 'syncStatus', 'envioIncerto', 'id'])

function date(value, month = false) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    value = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000).toISOString()
  }
  if (value instanceof Date) value = value.toISOString()
  const text = String(value)
  const civil = /^\d{2}\/\d{2}\/\d{4}$/.test(text) ? text.split('/').reverse().join('-') : text
  return /^\d{4}-\d{2}/.test(civil) ? civil.slice(0, month ? 7 : 10) : value
}

// Comparison lens only. Never rewrite snapshots or choose a winning version.
// Empty optional cells, Sheets date serials, decimal strings and app defaults
// otherwise produce misleading conflict counts. Originals remain untouched.
export function normalizeBusinessRecord(record) {
  const result = {}
  for (const [key, original] of Object.entries(record)) {
    if (audit.has(key)) continue
    if (original === '' || original === null || original === undefined) continue
    let value = original
    if (money.has(key)) {
      const text = String(original).trim()
      const number = Number(text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text)
      value = Number.isFinite(number) ? Math.round(number * 100) : original
    } else if (numeric.has(key)) {
      const number = Number(original)
      value = Number.isFinite(number) ? number : original
    } else if (booleans.has(key)) {
      const text = String(original).trim().toLowerCase()
      value = ['true', '1', 'sim'].includes(text) ? true : ['false', '0', 'nao', 'não'].includes(text) ? false : original
    } else if (dates.has(key)) value = date(original)
    else if (key === 'faturaRef' || key === 'mesReferencia') value = date(original, true)
    else if (key === 'deletedAt') value = true
    result[key] = value
  }
  // These defaults match the existing finance rules, not guesses about payment.
  result.faturaValorPago ??= 0
  result.faturaFechada ??= false
  result.recorrente ??= false
  result.parcelaAtual ??= 0
  result.totalParcelas ??= 0
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)))
}

export function semanticDifferences(group) {
  const normalized = group.versions.map(v => normalizeBusinessRecord(decode(v.comparison)))
  const fields = [...new Set(normalized.flatMap(Object.keys))].filter(field =>
    new Set(normalized.map(record => JSON.stringify(encode(record[field])))).size > 1)
  return { ...group, semanticFields: fields, semanticState: fields.length ? 'different' : group.versions.length > 1 ? 'equal' : 'single_source' }
}
