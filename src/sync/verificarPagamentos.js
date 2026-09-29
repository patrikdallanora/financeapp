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

const campos = [
  ['status', 'Situação', texto], ['dataPagamento', 'Data de pagamento', data],
  ['deletedAt', 'Excluído', Boolean], ['valor', 'Valor em centavos', centavos],
  ['metodoPagamento', 'Forma de pagamento', texto], ['dataCompetencia', 'Competência', data],
  ['faturaRef', 'Fatura', v => String(v || '').slice(0, 7)],
  ['cartaoUuid', 'Cartão', v => String(v || '')],
  ['faturaValorPago', 'Pagamento da fatura em centavos', centavos],
  ['faturaFechada', 'Fatura fechada', booleano]
]

export const diferencasPagamento = (local, remoto) => !remoto ? [] : campos.flatMap(([campo, rotulo, normalizar]) => {
  const a = normalizar(local[campo]), b = normalizar(remoto[campo])
  return a === b ? [] : [{ campo, rotulo, local: a, remoto: b }]
})
export const mesmoPagamento = (local, remoto) => Boolean(remoto) && String(local.uuid) === String(remoto.uuid) && !diferencasPagamento(local, remoto).length

// Only repair a clearly newer paid non-card record. Other differences require review.
export const podeReenviarPagamento = (local, remoto) => Boolean(remoto) &&
  local.syncStatus === 'synced' && !local.deletedAt && !remoto.deletedAt &&
  texto(local.tipo) === 'despesa' && texto(remoto.tipo) === 'despesa' &&
  texto(local.metodoPagamento) !== 'cartao' && texto(remoto.metodoPagamento) !== 'cartao' &&
  texto(local.status) === 'pago' && texto(remoto.status) === 'pendente' &&
  /^\d{4}-\d{2}-\d{2}$/.test(data(local.dataPagamento)) &&
  new Date(local.updatedAt).getTime() >= new Date(remoto.updatedAt).getTime() &&
  diferencasPagamento(local, remoto).every(d => ['status', 'dataPagamento'].includes(d.campo))

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
      diferencas: diferencasPagamento(local, remoto),
      podeReenviar: encontrados.length === 1 && podeReenviarPagamento(local, remoto),
      local: {status:local.status, atualizado:local.updatedAt, sincronizacao:local.syncStatus},
      remoto: remoto ? {status:remoto.status, atualizado:remoto.updatedAt} : null
    }]
  })
}
