import { mesmoPagamento } from './verificarPagamentos.js'

const texto = v => String(v ?? '').trim().toLowerCase()
const verdadeiro = v => ['true', '1', 'sim'].includes(texto(v))
const numero = v => {
  const s = String(v ?? 0)
  return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s) || 0
}

// One-time recovery authorized by the owner: existing phone payments are authoritative.
// Preserve the remote record's unrelated fields and the phone's IndexedDB primary key.
export function recuperarPagamentoLocal(local, candidatos, agora) {
  if (!local.uuid || local.deletedAt) return null
  const cartao = texto(local.metodoPagamento) === 'cartao'
  const pago = texto(local.status) === 'pago'
  if (!pago && !(cartao && (verdadeiro(local.faturaFechada) || numero(local.faturaValorPago) > 0))) return null
  if (candidatos.length > 1) throw new Error('Há um pagamento com UUID duplicado no servidor. A recuperação automática preservou os dados locais.')
  const remoto = candidatos[0]
  if (remoto?.deletedAt) throw new Error('Um pagamento deste aparelho foi excluído no servidor. Os dados locais foram preservados.')
  if (remoto && mesmoPagamento(local, remoto)) return null
  const base = remoto || local
  const recuperado = { ...base, id: local.id, uuid: local.uuid,
    status: pago ? 'pago' : base.status,
    dataPagamento: pago ? local.dataPagamento || String(local.dataCompetencia).slice(0, 10) : base.dataPagamento,
    updatedAt: agora, syncStatus: 'pending' }
  if (cartao) {
    recuperado.faturaValorPago = Math.max(numero(local.faturaValorPago), numero(base.faturaValorPago))
    recuperado.faturaFechada = verdadeiro(local.faturaFechada) || verdadeiro(base.faturaFechada) || pago
    if (recuperado.faturaFechada) recuperado.status = 'pago'
  }
  // Don't send a record solely because unrelated metadata differs.
  if (remoto && mesmoPagamento(recuperado, remoto)) return null
  return recuperado
}
