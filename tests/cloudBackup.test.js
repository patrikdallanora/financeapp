import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import Dexie from 'dexie'
import {randomUUID} from 'node:crypto'
import {createCloudDatabase} from '../src/db/cloudDatabase.js'
import {createBackupService,verifyInIsolatedDatabase} from '../src/backup/deviceBackup.js'
import {openBackup} from '../src/backup/backupCodec.js'
import {freezeNextOperation} from '../src/sync/localOutbox.js'
test('backup cloud restaura fila congelada, dependências e chaves compostas sem exportar a sessão',async t=>{
 const {raw,db}=createCloudDatabase('backup-cloud-'+randomUUID()),target=new Dexie('restore-cloud-'+randomUUID()),archive=new Dexie('archive-cloud-'+randomUUID())
 archive.version(1).stores({snapshots:'id,kind,createdAt'});await raw.open();await archive.open();t.after(async()=>{await raw.delete();await target.delete();await archive.delete()})
 const storage=new Map([['financeapp_device_id',randomUUID()],['financeapp_supabase_session','do-not-export-session']])
 await raw.syncState.put({key:'context',householdId:randomUUID(),deviceId:storage.get('financeapp_device_id'),ready:true})
 await db.lancamentos.add({uuid:randomUUID(),descricao:'Offline',tipo:'despesa',valor:10.25,status:'pendente',dataCompetencia:'2026-11-02'})
 await freezeNextOperation(raw);await db.lancamentos.update(1,{valor:20.50})
 await raw.syncInbox.add({jobId:randomUUID(),revision:7,table_name:'categorias',uuid:randomUUID(),payload:{nome:'staging'}})
 const service=createBackupService({db:raw,archive,storage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},origin:'https://example.invalid'})
 const backup=await service.capture(),snapshot=await openBackup(backup.envelope)
 assert.equal(JSON.stringify(snapshot).includes('do-not-export-session'),false);assert.equal(snapshot.counts.outbox,2)
 assert.ok(snapshot.tableSchemas.syncInbox.includes('jobId+revision'))
 target.version(1).stores(snapshot.tableSchemas);await target.open()
 await verifyInIsolatedDatabase(backup.envelope,target,raw.name)
 assert.equal((await target.table('outbox').toArray())[0].status,'sending')
 assert.equal((await target.table('outbox').toArray())[1].changes[0].dependsOn,(await target.table('outbox').toArray())[0].mutationId)
})
