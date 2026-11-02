import { decode } from './backupCodec.js'
import { normalizeBusinessRecord } from './semanticComparison.js'

const paymentFields = ['status','dataPagamento','faturaFechada','faturaValorPago']
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const priority = v => v.sourceLabel === 'iphone-15-pro' ? 0 : v.sourceLabel === 'iphone-16-pro' ? 1 : 2
const normalized = v => normalizeBusinessRecord(decode(v.comparison))

// Explicit decisions apply only to this captured set. Never deduplicate entries
// by descriptions/amounts, and never infer that "paid" always wins in the future.
export function consolidateSnapshots(report, decisions) {
  const aliases = new Map(), personAliases = new Map(), journal = [], unresolved = []
  const allowedNames = new Set(decisions.mergeCategoryNames || [])
  const approvedPayments = new Set(decisions.paidKeys || [])
  const chosen = new Map()
  for (const group of report.records) {
    const versions = [...group.versions].sort((a,b) => priority(a)-priority(b))
    let selected = versions[0]
    if (approvedPayments.has(group.key)) {
      selected = versions.find(v => normalized(v).status === 'pago')
      if (!selected) throw new Error('Approved paid version missing: '+group.key)
      journal.push({key:group.key,reason:'user_confirmed_paid',source:selected.sourceVersion})
    }
    chosen.set(group.key,{group,selected,record:normalized(selected)})
  }
  const categories = [...chosen.values()].filter(v=>v.group.key.startsWith('categorias:'))
  for (const name of allowedNames) {
    const matches = categories.filter(v=>v.record.nome === name)
    if(matches.length !== 2) throw new Error('Category merge preconditions differ: '+name)
    const uses = uuid => report.records.filter(g=>g.key.startsWith('lancamentos:') && g.versions.some(v=>normalized(v).categoriaUuid===uuid)).length
    matches.sort((a,b)=>Number(Boolean(a.record.deletedAt))-Number(Boolean(b.record.deletedAt)) || uses(b.record.uuid)-uses(a.record.uuid) || a.record.uuid.localeCompare(b.record.uuid))
    if(matches[0].record.deletedAt)throw new Error('Do not resurrect a deleted category: '+name)
    // An unused seed with a different type or an old tombstone may be aliased
    // only when it has no financial references. The used category keeps its type.
    if(matches.some(v=>(v.record.tipo!==matches[0].record.tipo||v.record.deletedAt)&&uses(v.record.uuid)>0))throw new Error('Category type/deletion has financial references: '+name)
    const target=matches[0].record.uuid
    for(const match of matches.slice(1)) {
      aliases.set(match.record.uuid,target)
      journal.push({key:match.group.key,reason:'user_approved_category_merge',canonicalUuid:target,originalType:match.record.tipo,canonicalType:matches[0].record.tipo,originalDeletedAt:match.selected.original.deletedAt||null})
    }
  }
  for(const name of decisions.mergePeopleNames||[]) {
    const matches=[...chosen.values()].filter(v=>v.group.key.startsWith('usuarios:')&&v.record.nome===name)
    const uses=uuid=>report.records.filter(g=>g.key.startsWith('lancamentos:')&&g.versions.some(v=>normalized(v).usuarioUuid===uuid)).length
    matches.sort((a,b)=>uses(b.record.uuid)-uses(a.record.uuid)||a.record.uuid.localeCompare(b.record.uuid))
    if(!matches.length||matches.some(v=>v.record.deletedAt))throw new Error('Person merge preconditions differ: '+name)
    const target=matches[0].record.uuid
    for(const match of matches.slice(1))personAliases.set(match.record.uuid,target)
    for(const [uuid,personName] of Object.entries(decisions.missingPersonAliases||{}))if(personName===name) {
      if(chosen.has('usuarios:'+uuid)||!uuidPattern.test(uuid))throw new Error('Expected absent person identity differs')
      personAliases.set(uuid,target)
    }
  }
  for(const [uuid,target] of personAliases)journal.push({key:'usuarios:'+uuid,reason:'user_approved_person_merge',canonicalUuid:target})
  const remap = record => {
    const r={...record}
    if(r.categoriaUuid)r.categoriaUuid=aliases.get(r.categoriaUuid)||r.categoriaUuid
    if(r.usuarioUuid)r.usuarioUuid=personAliases.get(r.usuarioUuid)||r.usuarioUuid
    // Unresolved legacy-ID annotations are comparison evidence, never domain fields.
    for(const field of Object.keys(r))if(field.endsWith('Unresolved'))delete r[field]
    return r
  }
  const tables={usuarios:[],cartoes:[],categorias:[],subcategorias:[],lancamentos:[],faturas:[],metas:[]}
  const provenance=[]
  for(const [key,{group,selected,record}] of chosen) {
    const table=key.split(':')[0]
    if(!uuidPattern.test(record.uuid))throw new Error('Invalid UUID: '+key)
    const canonical=remap(record)
    const authorizedFields = new Set()
    if(approvedPayments.has(key))for(const field of paymentFields)authorizedFields.add(field)
    if((decisions.categoryCorrectionKeys||[]).includes(key))authorizedFields.add('categoriaUuid')
    for(const version of group.versions) {
      const variant=remap(normalized(version))
      // A missing/ambiguous legacy category parent in Sheets does not overrule
      // the explicit, verified UUID parent in both corrected phone snapshots.
      if(table==='subcategorias' && !variant.categoriaUuid && selected.sourceLabel!=='Sheets backup')variant.categoriaUuid=canonical.categoriaUuid
      const differences=[...new Set([...Object.keys(canonical),...Object.keys(variant)])].filter(f=>JSON.stringify(canonical[f])!==JSON.stringify(variant[f])&&!authorizedFields.has(f))
      if(differences.length)unresolved.push({key,source:version.sourceVersion,fields:differences})
    }
    const identityAliases=table==='categorias'?aliases:table==='usuarios'?personAliases:new Map()
    provenance.push({key,canonicalKey:table+':'+(identityAliases.get(record.uuid)||record.uuid),selectedSource:selected.sourceVersion,sources:group.versions.map(v=>({source:v.sourceVersion,ordinal:v.ordinal}))})
    if(table==='categorias'&&aliases.has(record.uuid))continue
    if(table==='usuarios'&&personAliases.has(record.uuid))continue
    // The comparison lens intentionally reduces tombstones to true. Preserve
    // the actual timestamp for the destination; originals remain in provenance.
    canonical.deletedAt=selected.original.deletedAt || null
    if(canonical.deletedAt && Number.isNaN(Date.parse(canonical.deletedAt)))throw new Error('Invalid tombstone date: '+key)
    tables[table].push(canonical)
  }
  for(const [table,rows] of Object.entries(tables))rows.sort((a,b)=>a.uuid.localeCompare(b.uuid))
  const refs={usuarioUuid:'usuarios',cartaoUuid:'cartoes',categoriaUuid:'categorias',subcategoriaUuid:'subcategorias'}
  const maps=Object.fromEntries(Object.entries(tables).map(([table,rows])=>[table,new Map(rows.map(r=>[r.uuid,r]))]))
  for(const [table,rows] of Object.entries(tables))for(const row of rows) {
    for(const [field,target] of Object.entries(refs))if(row[field]&&!maps[target].has(row[field]))unresolved.push({key:table+':'+row.uuid,field,reason:'missing_uuid_target'})
    for(const field of ['valor','limite','valorAlvo','faturaValorPago'])if(row[field]!==undefined&&!Number.isSafeInteger(row[field]))unresolved.push({key:table+':'+row.uuid,field,reason:'invalid_centavos'})
    if(table==='lancamentos'&&row.subcategoriaUuid&&row.categoriaUuid&&maps.subcategorias.get(row.subcategoriaUuid)?.categoriaUuid!==row.categoriaUuid)unresolved.push({key:table+':'+row.uuid,reason:'subcategory_parent_mismatch'})
  }
  const totals={}
  for(const r of tables.lancamentos.filter(r=>!r.deletedAt)) {
    const key=r.tipo+':'+r.status
    totals[key]=(totals[key]||0)+(r.valor||0)
  }
  return {format:'financeapp-consolidated-candidate',version:1,ready:unresolved.length===0,tables,aliases:Object.fromEntries(aliases),personAliases:Object.fromEntries(personAliases),journal,provenance,unresolved,counts:Object.fromEntries(Object.entries(tables).map(([t,r])=>[t,r.length])),activeTotalsCentavos:totals}
}
