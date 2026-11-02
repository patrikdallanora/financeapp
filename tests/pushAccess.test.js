import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {registerSubscription} from '../api/push/subscription.js'
import {subscriptionValid} from '../lib/cloudServer.js'
test('push privado: somente servidor registra, troca endpoint e deduplica; pausa e revogação impedem envio',async t=>{
 const pg=new PGlite();t.after(()=>pg.close());const h=randomUUID(),u=randomUUID(),d=randomUUID()
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$`)
 for(const f of ['20261102133954_preservation_staging.sql','20261102200728_private_push_notifications.sql'])await pg.exec(await fs.readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'))
 await pg.query('insert into auth.users values($1)',[u]);await pg.query("insert into public.financeapp_households(id,name) values($1,'Test')",[h]);await pg.query("insert into financeapp_private.memberships(household_id,user_id,role) values($1,$2,'owner')",[h,u])
 await pg.exec('set role authenticated');await assert.rejects(pg.query('select public.financeapp_service_memberships($1)',[u]),/permission denied/)
 await pg.exec('reset role;set role service_role')
 const save=endpoint=>pg.query('select public.financeapp_service_register_push($1,$2,$3,$4,$5,$6)',[h,u,d,endpoint,'a'.repeat(87),'b'.repeat(22)])
 await save('https://web.push.apple.com/first');await save('https://web.push.apple.com/second')
 assert.equal((await pg.query('select count(*)::int n from financeapp_private.push_subscriptions where active')).rows[0].n,1)
 assert.equal((await pg.query('select * from public.financeapp_service_push_targets()')).rows.length,0)
 await pg.exec('reset role');await pg.query('update public.financeapp_households set sync_enabled=true where id=$1',[h]);await pg.exec('set role service_role')
 assert.equal((await pg.query('select * from public.financeapp_service_push_targets()')).rows.length,1)
 const claim=()=>pg.query('select public.financeapp_service_claim_notification($1,$2,$3,$4) ok',[h,d,'daily:2026-11-02','c'.repeat(64)])
 assert.equal((await claim()).rows[0].ok,true);assert.equal((await claim()).rows[0].ok,false)
 await pg.exec('reset role');await pg.query('update financeapp_private.memberships set active=false where household_id=$1',[h]);await pg.exec('set role service_role')
 assert.equal((await pg.query('select * from public.financeapp_service_push_targets()')).rows.length,0)
 await assert.rejects(save('https://web.push.apple.com/third'),/Inactive member/)
})
test('registro de push recusa sessão ausente, pessoa sem base e endpoint externo antes de gravar',async()=>{
 const res=()=>({status(n){this.code=n;return this},json(x){this.body=x;return this}})
 let calls=0;const database={auth:{getUser:async()=>({data:{user:{id:randomUUID()}}})},rpc:async name=>{calls++;return {data:name==='financeapp_service_memberships'?[{household_id:randomUUID(),sync_enabled:true}]:null}}}
 let r=res();await registerSubscription({method:'POST',headers:{}},r,database);assert.equal(r.code,401);assert.equal(calls,0)
 const request={method:'POST',headers:{authorization:'Bearer session'},body:{deviceId:randomUUID(),subscription:{endpoint:'https://example.com/steal',keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}}}}
 r=res();await registerSubscription(request,r,database);assert.equal(r.code,400);assert.equal(calls,1)
 database.rpc=async()=>({data:[]});r=res();await registerSubscription(request,r,database);assert.equal(r.code,403)
 assert.equal(subscriptionValid({...request.body.subscription,endpoint:'https://web.push.apple.com/valid'}),true)
 assert.equal(subscriptionValid({...request.body.subscription,endpoint:'https://web.push.apple.com.evil.example/x'}),false)
})

