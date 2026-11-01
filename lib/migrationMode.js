// Temporary preservation release. Remove only after both phones are reconciled.
export const MIGRATION_CAPTURE_MODE = true
export const MIGRATION_MESSAGE = 'Sincronização pausada para preservar os dados dos dois aparelhos durante a migração.'

export function exigirEscritaLiberada() {
  if (MIGRATION_CAPTURE_MODE) throw new Error(MIGRATION_MESSAGE)
}
