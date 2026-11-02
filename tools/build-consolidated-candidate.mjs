import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { consolidateSnapshots } from '../src/backup/consolidateSnapshots.js'
const [reportDir,outDir]=process.argv.slice(2)
if(!outDir)throw new Error('Usage: node tools/build-consolidated-candidate.mjs PRIVATE_REPORT_DIR PRIVATE_OUTPUT_DIR')
const report=JSON.parse(await fs.readFile(path.join(reportDir,'three-sources-semantic-private.json'),'utf8'))
const decisions=JSON.parse(await fs.readFile(path.join(outDir,'decisions.json'),'utf8'))
const candidate=consolidateSnapshots(report,decisions)
await fs.writeFile(path.join(outDir,'candidate-private.json'),JSON.stringify(candidate))
const summary={ready:candidate.ready,counts:candidate.counts,categoryAliases:Object.keys(candidate.aliases).length,paymentsConfirmed:candidate.journal.filter(j=>j.reason==='user_confirmed_paid').length,unresolved:candidate.unresolved,activeTotalsCentavos:candidate.activeTotalsCentavos,sha256:createHash('sha256').update(JSON.stringify(candidate)).digest('hex')}
await fs.writeFile(path.join(outDir,'candidate-verification.json'),JSON.stringify(summary,null,2))
console.log(JSON.stringify(summary,null,2))
