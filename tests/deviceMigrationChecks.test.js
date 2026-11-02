import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {randomUUID,createHash} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
test('conferência exige membro, backup de aparelho válido e o snapshot atual; repetição não duplica',async t=>{
 const pg=new PGlite();t.after(()=>pg.close())
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`)
 for(const f of ['20261102133954_preservation_staging.sql','20261102160320_immutable_preservation_archives.sql','20261102162531_canonical_sync_protocol.sql','20261102165755_device_migration_checks.sql'])await pg.exec(await fs.readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'))
 const h=randomUUID(),run=randomUUID(),owner=randomUUID(),device=randomUUID(),hash='a'.repeat(64),text='verified backup'
 await pg.query('insert into auth.users values($1)',[owner]);await pg.query("insert into public.financeapp_households(id,name) values($1,'Test')",[h])
 await pg.query("insert into financeapp_private.memberships(household_id,user_id,role) values($1,$2,'owner')",[h,owner])
 await pg.query(`insert into financeapp_private.migration_runs(id,household_id,expected_devices) values($1,$2,'["iphone-15-pro","iphone-16-pro"]')`,[run,h])
 await pg.query(`insert into financeapp_private.canonical_imports(household_id,migration_run_id,candidate_sha256,manifest,decisions) values($1,$2,$3,'{"counts":{"lancamentos":0}}','{}')`,[h,run,hash])
 await pg.query(`insert into financeapp_private.source_backups(household_id,migration_run_id,source_kind,source_id,sha256,manifest,envelope_text,captured_at,restore_verified_at) values($1,$2,'iphone',$3,$4,'{}',$5,now(),now())`,[h,run,device,createHash('sha256').update(text).digest('hex'),text])
 await pg.exec(`set role authenticated;set request.jwt.claim.sub='${owner}'`)
 const status=async()=>(await pg.query('select public.financeapp_migration_status($1,$2) as status',[h,device])).rows[0].status
 const confirm=(d=device,c=hash)=>pg.query('select public.financeapp_confirm_migration_device($1,$2,$3)',[h,d,c])
 assert.equal((await status()).knownDevice,true);assert.equal((await status()).confirmedDevices,0)
 await assert.rejects(confirm(randomUUID()),/original iPhone/);await assert.rejects(confirm(device,'b'.repeat(64)),/Snapshot changed/)
 await confirm();await confirm();assert.equal((await status()).confirmedDevices,1);assert.equal((await status()).deviceConfirmed,true)
 await pg.exec(`set request.jwt.claim.sub='${randomUUID()}'`);await assert.rejects(status(),/Not a household member/)
})
