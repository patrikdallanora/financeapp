// Distribute integer cents once, shared by the preview and persisted installments.
export function distribuirParcelas(valor, quantidade, modo = 'total') {
  if (!Number.isInteger(quantidade) || quantidade < 2 || quantidade > 999 || !Number.isFinite(valor)) return []
  const total = Math.round(valor * 100) * (modo === 'parcela' ? quantidade : 1)
  if (!Number.isSafeInteger(total) || total < quantidade) return []
  const base = Math.floor(total / quantidade)
  const resto = total % quantidade
  return Array.from({ length: quantidade }, (_, i) => (base + (i < resto ? 1 : 0)) / 100)
}

export function somarMeses(dataBase, quantidade) {
  const [ano, mes, dia] = dataBase.split('-').map(Number)
  if (!ano || !mes || !dia) return ''
  const destino = new Date(Date.UTC(ano, mes - 1 + quantidade, 1))
  const ultimoDia = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate()
  destino.setUTCDate(Math.min(dia, ultimoDia))
  return destino.toISOString().slice(0, 10)
}
