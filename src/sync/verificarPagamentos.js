const texto = valor => String(valor ?? '').trim().toLowerCase()
const data = valor => {
  const s = String(valor ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s.split('/').reverse().join('-')
  return s
}
const centavos = valor => {
  const s = String(valor ?? 0).trim()
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}
const booleano = valor => ['true', '1', 'sim'].includes(texto(valor))

export const mesmoPagamento = (local, remoto) => Boolean(remoto) &&
  String(local.uuid) === String(remoto.uuid) &&
  texto(local.status) === texto(remoto.status) &&
  data(local.dataPagamento) === data(remoto.dataPagamento) &&
  Boolean(local.deletedAt) === Boolean(remoto.deletedAt) &&
  centavos(local.valor) === centavos(remoto.valor) &&
  texto(local.metodoPagamento) === texto(remoto.metodoPagamento) &&
  data(local.dataCompetencia) === data(remoto.dataCompetencia) &&
  String(local.faturaRef || '').slice(0, 7) === String(remoto.faturaRef || '').slice(0, 7) &&
  String(local.cartaoUuid || '') === String(remoto.cartaoUuid || '') &&
  centavos(local.faturaValorPago) === centavos(remoto.faturaValorPago) &&
  booleano(local.faturaFechada) === booleano(remoto.faturaFechada)

export function compararPagamentos(locais, remotos) {
  const porUuid = new Map()
  for (const item of remotos) {
    const lista = porUuid.get(item.uuid) || []
    lista.push(item)
    porUuid.set(item.uuid, lista)
  }
  return locais.flatMap(local => {
    const encontrados = porUuid.get(local.uuid) || []
    if (encontrados.length === 1 && mesmoPagamento(local, encontrados[0])) return []
    const remoto = encontrados[0]
    return [{
      uuid: local.uuid, descricao: local.descricao || 'Lançamento',
      referencia: String(local.faturaRef || local.dataCompetencia || '').slice(0, 10),
      motivo: encontrados.length > 1 ? 'UUID duplicado no servidor' : remoto ? 'Pagamento ou referência diferente' : 'Não encontrado no servidor',
      local: {status:local.status, atualizado:local.updatedAt, sincronizacao:local.syncStatus},
      remoto: remoto ? {status:remoto.status, atualizado:remoto.updatedAt} : null
    }]
  })
}
