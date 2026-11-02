import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {reconcileSnapshots} from '../src/backup/reconcileBackups.js'
import {semanticDifferences} from '../src/backup/semanticComparison.js'
import {consolidateSnapshots} from '../src/backup/consolidateSnapshots.js'
const tables=()=>({usuarios:[],cartoes:[],categorias:[],subcategorias:[],lancamentos:[],faturas:[],metas:[]})
const snapshot=(label,t)=>({source:{deviceId:label,label},createdAt:'2026-11-02T00:00:00Z',tables:t})
const report=sources=>({records:reconcileSnapshots(sources).records.map(semanticDifferences)})
test('consolidação conserva UUIDs distintos, excluídos, campos extras e centavos; só resolve pagamentos aprovados',()=>{
 const a=tables(),b=tables(),uuid=randomUUID(),second=randomUUID()
 a.lancamentos=[{uuid,descricao:'Same',valor:10.25,status:'pago',dataCompetencia:'2026-11-02',deletedAt:null,extra:{original:true}},{uuid:second,descricao:'Same',valor:10.25,status:'pago',dataCompetencia:'2026-11-02',deletedAt:'2026-11-01T12:00:00Z'}]
 b.lancamentos=[{...a.lancamentos[0],status:'pendente'}]
 const sources=[snapshot('iphone-15-pro',a),snapshot('iphone-16-pro',b)],input=JSON.stringify(sources),r=report(sources)
 assert.equal(consolidateSnapshots(r,{}).ready,false)
 const c=consolidateSnapshots(r,{paidKeys:['lancamentos:'+uuid]})
 assert.equal(c.ready,true);assert.equal(c.tables.lancamentos.length,2);assert.equal(c.tables.lancamentos.find(x=>x.uuid===uuid).valor,1025)
 assert.deepEqual(c.tables.lancamentos.find(x=>x.uuid===uuid).extra,{original:true})
 assert.equal(c.tables.lancamentos.find(x=>x.uuid===second).deletedAt,'2026-11-01T12:00:00Z');assert.equal(JSON.stringify(sources),input)
 b.lancamentos[0].valor=20
 assert.equal(consolidateSnapshots(report(sources),{paidKeys:['lancamentos:'+uuid]}).ready,false)
})
test('mapa explícito une categorias e pessoas sem perder relações nem mesclar outras entidades pelo nome',()=>{
 const a=tables(),cat1=randomUUID(),cat2=randomUUID(),person1=randomUUID(),person2=randomUUID(),missing=randomUUID(),sub=randomUUID(),launch=randomUUID()
 a.categorias=[{uuid:cat1,nome:'Saúde',tipo:'despesa'},{uuid:cat2,nome:'Saúde',tipo:'despesa'}]
 a.usuarios=[{uuid:person1,nome:'PK'},{uuid:person2,nome:'PK'}]
 a.subcategorias=[{uuid:sub,nome:'Vacinas',categoriaUuid:cat1}]
 a.lancamentos=[{uuid:launch,descricao:'Vacina',valor:10,status:'pago',categoriaUuid:cat2,subcategoriaUuid:sub,usuarioUuid:missing}]
 const r=report([snapshot('iphone-15-pro',a)])
 assert.equal(consolidateSnapshots(r,{}).ready,false)
 const c=consolidateSnapshots(r,{mergeCategoryNames:['Saúde'],mergePeopleNames:['PK'],missingPersonAliases:{[missing]:'PK'}})
 assert.equal(c.ready,true);assert.equal(c.tables.categorias.length,1);assert.equal(c.tables.usuarios.length,1)
 assert.equal(c.tables.subcategorias[0].categoriaUuid,c.tables.lancamentos[0].categoriaUuid)
 assert.equal(c.tables.lancamentos[0].usuarioUuid,c.tables.usuarios[0].uuid)
 assert.equal(c.provenance.length,r.records.length)
})
