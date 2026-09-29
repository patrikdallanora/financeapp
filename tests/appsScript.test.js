import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
const code=fs.readFileSync(new URL('../backend/sync-core.gs',import.meta.url),'utf8')
const context=()=>vm.createContext({Date,Map,Set,isFinite,SECRET:'test',TABELAS:['lancamentos'],META_SHEET:'_sync_meta',json:x=>x})
const headers=['uuid','updatedAt','status','observacoes']
test('Apps Script não sobrescreve baixa nova com cópia antiga e preserva campos omitidos',()=>{
 const c=context();vm.runInContext(code,c)
 const old=[['a','2026-09-29T13:00:00Z','pago','manter']]
 const p=c.planejarLote(headers,old,[{uuid:'a',updatedAt:'2026-09-28T13:00:00Z',status:'pendente'}])
 assert.equal(p.alteracoes.length,0);assert.equal(p.ignorados[0],'a')
 const q=c.planejarLote(headers,old,[{uuid:'a',updatedAt:'2026-09-29T14:00:00Z',status:'pago'}])
 assert.equal(q.alteracoes[0].valores[3],'manter')
 assert.throws(()=>c.planejarLote(headers,[...old,...old],[{uuid:'a'}]),/duplicado/)
 assert.throws(()=>c.planejarLote(headers,[],[{uuid:'a'},{uuid:'a'}]),/repetido/)
})
test('Apps Script agrupa linhas adjacentes em uma gravação e insere sem duplicar',()=>{
 const c=context();vm.runInContext(code,c);const calls=[]
 c.gravarGrupos({getRange(...args){return{setValues(v){calls.push({args,v})}}}},[{linha:2,valores:['a']},{linha:3,valores:['b']},{linha:8,valores:['c']}],1)
 assert.equal(calls.length,2);assert.equal(calls[0].args[2],2)
})
test('Apps Script normaliza Date na leitura incremental e só retorna alterações posteriores',()=>{
 const c=context();c.SpreadsheetApp={getActiveSpreadsheet(){return{getSheetByName(){return{getDataRange(){return{getValues(){return[['uuid','updatedAt'],['a',new Date('2026-09-01T00:00:00Z')],['b',new Date('2026-09-29T00:00:00Z')]]}}}}}}}}
 vm.runInContext(code,c);const r=c.lerTabelaIncremental('lancamentos','2026-09-28T00:00:00Z');assert.equal(r.length,1);assert.equal(r[0].uuid,'b');assert.equal(r[0].updatedAt,'2026-09-29T00:00:00.000Z')
})
test('Apps Script rejeita sem lock e libera o lock mesmo após erro',()=>{
 const c=context();let released=0,held=false;c.LockService={getScriptLock(){return{tryLock(){return held},hasLock(){return held},releaseLock(){released++}}}};vm.runInContext(code,c)
 const event={postData:{contents:JSON.stringify({secret:'test',tabela:'lancamentos',registros:[]})}}
 assert.equal(c.doPost(event).retryable,true);assert.equal(released,0);held=true;assert.equal(c.doPost(event).versaoSync,2);assert.equal(released,1)
 const bad={postData:{contents:JSON.stringify({secret:'test',tabela:'lancamentos',registros:[{uuid:'x'}]})}};assert.equal(c.doPost(bad).retryable,true);assert.equal(released,2)
})
