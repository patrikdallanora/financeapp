import 'fake-indexeddb/auto'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createCloudDatabase} from '../src/db/cloudDatabase.js'
import {BUSINESS_TABLES,stageAndApplyPull,toCanonicalRecord} from '../src/sync/localOutbox.js'
const [directory]=process.argv.slice(2),candidate=JSON.parse(await fs.readFile(path.join(directory,'candidate-private.json'),'utf8'))
const {raw}=createCloudDatabase('FinanceApp-migration-verification-'+randomUUID()),household=randomUUID()
try{
 await raw.open();await raw.syncState.put({key:'context',householdId:household,deviceId:randomUUID(),ready:false})
 let revision=0
 const records=BUSINESS_TABLES.flatMap(table=>candidate.tables[table].map(payload=>({household_id:household,table_name:table,uuid:payload.uuid,payload,revision:++revision})))
 for(let pass=0;pass<2;pass++){
  await stageAndApplyPull(raw,async after=>{const page=records.filter(r=>r.revision>after).slice(0,137),next=page.at(-1)?.revision||after;return {protocol:1,householdId:household,tables:BUSINESS_TABLES,after,head:records.length,next,more:next<records.length,records:page}},household)
  const catalogs=Object.fromEntries(await Promise.all(BUSINESS_TABLES.map(async t=>[t,await raw.table(t).toArray()])))
  for(const table of BUSINESS_TABLES){const restored=catalogs[table].map(r=>toCanonicalRecord(r,catalogs)).sort((a,b)=>a.uuid.localeCompare(b.uuid));assert.deepEqual(restored,candidate.tables[table])}
  assert.equal(catalogs.usuarios.find(r=>r.nome==='PK').id,1);assert.equal(catalogs.usuarios.find(r=>r.nome==='Grazi').id,2)
 }
 const result={passes:2,exactRestoration:true,records:records.length,counts:candidate.counts,localIdsResolvedByUuid:true,originalDatabaseUntouched:true}
 await fs.writeFile(path.join(directory,'client-copy-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}finally{await raw.delete()}
