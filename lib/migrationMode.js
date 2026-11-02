// Temporary preservation release. Remove only after both phones are reconciled.
export const MIGRATION_CAPTURE_MODE = false
// Retired endpoints remain closed even after the financial UI is reopened.
export const LEGACY_BACKEND_DISABLED = true
export const MIGRATION_MESSAGE = 'Sincronização pausada para preservar os dados dos dois aparelhos durante a migração.'

export function exigirEscritaLiberada() {
  if (MIGRATION_CAPTURE_MODE || LEGACY_BACKEND_DISABLED) throw new Error(MIGRATION_MESSAGE)
}
