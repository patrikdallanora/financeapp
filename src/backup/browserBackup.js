import Dexie from 'dexie'
import { db } from '../db/database.js'
import { createBackupService } from './deviceBackup.js'

const archive = new Dexie('FinanceAppPreservationBackups')
archive.version(1).stores({ snapshots: 'id, kind, createdAt' })

export const deviceBackup = createBackupService({ db, archive,
  storage: localStorage, origin: window.location.origin })

export function prepareBackupFile(backup, label) {
  const name = label.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 60) || 'aparelho'
  const date = backup.snapshot.createdAt.replace(/[:.]/g, '-')
  return new File([JSON.stringify(backup.envelope)], `financeapp-${name}-${backup.snapshot.source.deviceId.slice(0, 8)}-${date}.json`,
    { type: 'application/json' })
}

// Call directly on a second user tap: snapshot/hash preparation must not consume
// the transient user activation required by iOS Web Share.
export async function saveBackupFile(file, { share = false } = {}) {
  if (share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Backup do FinanceApp' })
    return 'shared'
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
  return 'download-requested'
}
