import fs from 'node:fs/promises'
import path from 'node:path'
import { semanticDifferences } from '../src/backup/semanticComparison.js'

const directory = process.argv[2]
for (const name of ['phones', 'three-sources']) {
  const input = JSON.parse(await fs.readFile(path.join(directory, `${name}-reconciliation-private.json`), 'utf8'))
  const records = input.records.map(semanticDifferences)
  const conflicts = records.filter(r => r.semanticState === 'different')
  const fields = {}
  for (const group of conflicts) {
    const table = group.key.split(':')[0]
    for (const field of group.semanticFields) fields[`${table}:${field}`] = (fields[`${table}:${field}`] || 0) + 1
  }
  const summary = { source: name, totalIdentities: records.length, conflicts: conflicts.length,
    conflictFields: fields, byTable: Object.fromEntries([...Map.groupBy(records, r => r.key.split(':')[0])]
      .map(([table, groups]) => [table, { total: groups.length, different: groups.filter(r => r.semanticState === 'different').length }])) }
  await fs.writeFile(path.join(directory, `${name}-semantic-private.json`), JSON.stringify({ summary, records }))
  console.log(JSON.stringify(summary, null, 2))
}
