import test from 'node:test'
import assert from 'node:assert/strict'
import { recuperarPagamentoLocal } from '../src/sync/recuperarPagamentoLocal.js'
import handler from '../api/sync.js'

test('recupera baixa antiga preservando campos remotos e chave local', () => {
  const local={id:7,uuid:'a',status:'pago',valor:50,metodoPagamento:'pix',dataPagamento:'2026-09-08',syncStatus:'synced'}
  const remoto={...local,id:99,status:'pendente',valor:51,observacoes:'manter'}
  const novo=recuperarPagamentoLocal(local,[remoto],'2026-09-29T15:00:00Z')
  assert.equal(novo.id,7);assert.equal(novo.status,'pago');assert.equal(novo.valor,51);assert.equal(novo.observacoes,'manter');assert.equal(novo.syncStatus,'pending')
  assert.throws(()=>recuperarPagamentoLocal(local,[remoto,remoto],''),/duplicado/)
  assert.throws(()=>recuperarPagamentoLocal(local,[{...remoto,deletedAt:'2026-09-01'}],''),/excluído/)
  assert.equal(recuperarPagamentoLocal({...local,deletedAt:'2026-09-01'},[],''),null)
})
test('proxy exige credencial, valida tabela, preserva JSON e não expõe HTML', async t => {
  const old={url:process.env.VITE_SHEETS_API_URL,secret:process.env.VITE_API_SECRET}
  process.env.VITE_SHEETS_API_URL='https://example.invalid/exec';process.env.VITE_API_SECRET='test'
  t.after(()=>{for(const [key,v] of [['VITE_SHEETS_API_URL',old.url],['VITE_API_SECRET',old.secret]]){if(v===undefined)delete process.env[key];else process.env[key]=v}})
  let html=false,calls=0
  t.mock.method(globalThis,'fetch',async(url,options)=>{calls++;assert.equal(new URL(url).hostname,'example.invalid');assert.equal(options.redirect,'follow');return new Response(html?'<html>private</html>':JSON.stringify({sucesso:true}))})
  const invoke=async req=>{const res={setHeader(){},status(s){this.code=s;return this},json(v){this.data=v;return this}};await handler(req,res);return res}
  assert.equal((await invoke({method:'GET',query:{secret:'wrong'}})).code,401);assert.equal(calls,0)
  assert.equal((await invoke({method:'POST',body:{secret:'test',tabela:'other',registros:[]}})).code,400)
  assert.equal((await invoke({method:'GET',query:{secret:'test',modo:'pullBatch',tabelas:'lancamentos'}})).data.sucesso,true)
  html=true;const r=await invoke({method:'POST',body:JSON.stringify({secret:'test',tabela:'lancamentos',registros:[]})});assert.equal(r.code,502);assert.equal(JSON.stringify(r.data).includes('<html>'),false)
})
