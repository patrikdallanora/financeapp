import test from 'node:test'
import assert from 'node:assert/strict'
import {hojeISO} from '../lib/alertasFinanceiros.js'
import {enviarAlertasProgramados} from '../api/push/cron.js'
const response=()=>({status(c){this.code=c;return this},json(b){this.body=b;return this}})
function fixture(){
 let paid=20000,claims=new Set()
 const sent=[]
 const target={household_id:'home',device_id:'phone',endpoint:'https://web.push.apple.com/test',endpoint_sha256:'hash',p256dh_key:'test',auth_key:'test'}
 const database={rpc:async(name,args)=>{
  if(name==='financeapp_service_push_targets')return {data:[target]}
  if(name==='financeapp_service_claim_notification'){if(claims.has(args.p_key))return {data:false};claims.add(args.p_key);return {data:true}}
  return {data:null}
 },from(){let table;const q={select(){return q},eq(k,v){if(k==='table_name')table=v;if(k==='household_id')assert.equal(v,'home');return q},order(){return q},async range(){return {data:(table==='cartoes'?[{uuid:'card',diaVencimento:1}]:[1,2].map(uuid=>({uuid:String(uuid),tipo:'despesa',status:'pendente',metodoPagamento:'cartao',cartaoUuid:'card',faturaRef:hojeISO().slice(0,7),valor:10000,faturaValorPago:paid}))).map(payload=>({payload}))}}};return q}}
 const run=async(query={})=>{const res=response();await enviarAlertasProgramados({method:'GET',headers:{authorization:'Bearer test-cron'},query},res,{database,cronSecret:'test-cron',send:async(_s,p)=>sent.push(JSON.parse(p))});return res}
 return {run,sent,setPaid:value=>paid=value,database}
}
test('cron Supabase não cobra quitada, calcula saldo parcial uma vez e deduplica reexecução',async()=>{
 const f=fixture();assert.equal((await f.run()).body.notificou,false);assert.equal(f.sent.length,0)
 f.setPaid(15000);assert.equal((await f.run({dryRun:'1'})).body.prontos,1);assert.equal(f.sent.length,0)
 const result=await f.run();assert.equal(result.code,200);assert.equal(result.body.enviados,1);assert.match(f.sent[0].body,/50,00/)
 assert.equal((await f.run()).body.enviados,0);assert.equal(f.sent.length,1)
})
test('cron recusa chamada sem segredo antes de ler dados ou enviar push',async()=>{
 const res=response();await enviarAlertasProgramados({headers:{}},res,{cronSecret:'secret',database:{rpc(){throw Error('unexpected')}}});assert.equal(res.code,401)
})
