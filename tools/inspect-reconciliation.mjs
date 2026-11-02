import fs from 'node:fs/promises'
import path from 'node:path'
import { decode } from '../src/backup/backupCodec.js'

const directory = process.argv[2]
const report = JSON.parse(await fs.readFile(path.join(directory, 'phones-reconciliation-private.json'), 'utf8'))
const differing = report.records.filter(record => record.state === 'different')
const fieldCounts = {}
const names = []
for (const record of differing) {
  const table = record.key.split(':')[0]
  const versions = record.versions.map(version => decode(version.comparison))
  const fields = [...new Set(versions.flatMap(version => Object.keys(version)))].filter(field =>
    new Set(versions.map(version => JSON.stringify(version[field]))).size > 1)
  for (const field of fields) fieldCounts[`${table}:${field}`] = (fieldCounts[`${table}:${field}`] || 0) + 1
  if (table !== 'lancamentos') names.push({ table, identity: record.key, fields,
    versions: record.versions.map(v => ({ source: v.sourceLabel, nome: v.original.nome })) })
}
console.log(JSON.stringify({ fields: fieldCounts, catalogConflicts: names }, null, 2))
