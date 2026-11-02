import Dexie from 'dexie'
import { legacyDb as db } from '../db/database.js'
import { createBackupService } from './deviceBackup.js'
import { applyCategoryRepair } from './categoryRepair.js'

const archive = new Dexie('FinanceAppPreservationBackups')
archive.version(1).stores({ snapshots: 'id, kind, createdAt' })

export const deviceBackup = createBackupService({ db, archive,
  storage: localStorage, origin: window.location.origin })

let categoryRepairPromise
export function repairCategoriesOnDevice() {
  if (categoryRepairPromise) return categoryRepairPromise
  categoryRepairPromise = (async () => {
    const before = await deviceBackup.capture({ kind: 'before-category-repair' })
    const response = await fetch('/api/category-repair', { method: 'POST', cache: 'no-store',
      headers: { 'X-Financeapp-Token': import.meta.env.VITE_API_SECRET || '' } })
    const data = await response.json()
    if (!response.ok || data.sucesso !== true) throw new Error(data.erro || 'Catálogo indisponível.')
    const result = await applyCategoryRepair(db, before.snapshot, data.categorias)
    let afterBackupSaved = true
    try { await deviceBackup.capture({ kind: 'after-category-repair' }) }
    catch { afterBackupSaved = false }
    return { ...result.summary, pending: result.pending.length, afterBackupSaved }
  })().finally(() => { categoryRepairPromise = null })
  return categoryRepairPromise
}

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
