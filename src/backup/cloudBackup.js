import Dexie from 'dexie'
import {cloudDatabase} from '../db/cloudDatabase.js'
import {createBackupService} from './deviceBackup.js'
const archive=new Dexie('FinanceAppCloudBackups')
archive.version(1).stores({snapshots:'id,kind,createdAt'})
export const cloudBackup=createBackupService({db:cloudDatabase.raw,archive,storage:localStorage,origin:window.location.origin})
