// Não confirmar uma edição que ocorreu enquanto a versão anterior era enviada.
export const confirmarRegistroEnviado = (local, enviado, agora) => {
  if (local.syncStatus !== 'pending') return
  const campos = new Set([...Object.keys(local), ...Object.keys(enviado)])
  campos.delete('syncStatus')
  campos.delete('lastSyncedAt')
  if ([...campos].some((campo) => JSON.stringify(local[campo]) !== JSON.stringify(enviado[campo]))) return
  delete local.envioIncerto
  local.syncStatus = 'synced'
  local.lastSyncedAt = agora
}
