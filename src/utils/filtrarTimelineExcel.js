// Recorrências mensais pertencem a "Todas", mas não são lançamentos únicos.
export function filtrarTimelineExcel(timeline, escopo = 'todas') {
  if (escopo === 'todas') return timeline
  const incluir = (item) => escopo === 'parceladas'
    ? Number(item.totalParcelas || 0) > 1
    : Number(item.totalParcelas || 0) <= 1 && ![true, 1, '1', 'true'].includes(item.recorrente)
  return timeline.map(([data, itens]) => [data, itens.flatMap((item) => {
    if (item.tipo !== 'fatura') return incluir(item.lancamento) ? [item] : []
    const selecionados = item.fatura.itens.filter(incluir)
    if (!selecionados.length) return []
    return [{ ...item, fatura: { ...item.fatura, itens: selecionados,
      total: selecionados.reduce((total, lancamento) => total + Number(lancamento.valor || 0), 0) } }]
  })]).filter(([, itens]) => itens.length > 0)
}
