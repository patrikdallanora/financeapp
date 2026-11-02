import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
test('somente e-mail confirmado e provisionado recebe acesso; metadados e anônimos não concedem papel',async t=>{
 const pg=new PGlite();t.after(()=>pg.close())
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;`)
 for(const f of ['20261102133954_preservation_staging.sql','20261102162947_verified_owner_access.sql'])await pg.exec(await fs.readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'))
 const h=randomUUID(),owner=randomUUID(),intruder=randomUUID(),anonymous=randomUUID()
 await pg.query("insert into public.financeapp_households(id,name) values($1,'Test')",[h])
 await pg.query("insert into financeapp_private.login_allowlist(household_id,email,role) values($1,'owner@example.test','owner')",[h])
 await pg.query("insert into auth.users(id,email) values($1,'owner@example.test')",[owner])
 assert.equal((await pg.query('select count(*) as n from financeapp_private.memberships')).rows[0].n,0)
 await pg.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,'intruder@example.test',now(),$2)",[intruder,JSON.stringify({role:'owner',household_id:h,email:'owner@example.test'})])
 await pg.query("insert into auth.users(id,email,email_confirmed_at,is_anonymous) values($1,'owner@example.test',now(),true)",[anonymous])
 assert.equal((await pg.query('select count(*) as n from financeapp_private.memberships')).rows[0].n,0)
 await pg.query('update auth.users set email_confirmed_at=now() where id=$1',[owner])
 assert.equal((await pg.query('select user_id from financeapp_private.memberships')).rows[0].user_id,owner)
 await pg.query("update auth.users set email='owner@example.test' where id=$1",[intruder])
 assert.equal((await pg.query('select count(*) as n from financeapp_private.memberships')).rows[0].n,1)
 await pg.query('update financeapp_private.memberships set active=false where user_id=$1',[owner])
 await pg.query('update auth.users set email_confirmed_at=now() where id=$1',[owner])
 assert.equal((await pg.query('select active from financeapp_private.memberships')).rows[0].active,false)
 await pg.exec('set role authenticated');await assert.rejects(pg.query('select * from financeapp_private.login_allowlist'),/permission denied/)
})
