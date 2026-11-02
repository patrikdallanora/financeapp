import fs from 'node:fs/promises'
import path from 'node:path'
import { openBackup } from '../src/backup/backupCodec.js'
import { auditCategoryLinks } from '../src/backup/auditCategoryLinks.js'

const [inputDir, outputDir] = process.argv.slice(2)
const snapshots = []
for (const file of (await fs.readdir(inputDir)).filter(f => f.startsWith('financeapp-') && f.endsWith('.json') && !f.includes('-inicial-'))) {
  snapshots.push(await openBackup(JSON.parse(await fs.readFile(path.join(inputDir, file), 'utf8'))))
}
const report = auditCategoryLinks(snapshots)
await fs.mkdir(outputDir, { recursive: true })
await fs.writeFile(path.join(outputDir, 'category-links-full-private.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ sources: report.sources.map(s => ({ label: s.label, summary: s.summary,
  duplicateNames: s.duplicateNames, nameDifferences: s.nameDifferences })),
  crossDevice: report.crossDevice.map(({ first, second, count }) => ({ first, second, count })) }, null, 2))
