export const mesAnterior = (referencia) => {
  const [ano, mes] = referencia.split('-').map(Number)
  return `${mes === 1 ? ano - 1 : ano}-${String(mes === 1 ? 12 : mes - 1).padStart(2, '0')}`
}

const encontrarCategoria = (categorias, item) =>
  categorias.find((c) => item.categoriaUuid && c.uuid === item.categoriaUuid) ||
  categorias.find((c) => item.categoriaId != null && Number(c.id) === Number(item.categoriaId))

export const selecionarLancamentosMes = (lancamentos, categorias, mes) => lancamentos.filter((item) => {
  if (item.deletedAt) return false
  const referencia = item.metodoPagamento === 'cartao' ? item.faturaRef : item.dataCompetencia
  if (String(referencia || '').slice(0, 7) !== mes) return false
  const nome = String(encontrarCategoria(categorias, item)?.nome || '').trim().toLowerCase()
  return nome !== 'reembolso' && nome !== 'reembolsos'
})

export const resumirMes = (itens) => {
  const centavos = (tipo) => itens.filter((i) => i.tipo === tipo).reduce((s, i) => s + Math.round(Number(i.valor || 0) * 100), 0)
  const receita = centavos('receita') / 100
  const despesa = centavos('despesa') / 100
  return { receita, despesa, saldo: (Math.round(receita * 100) - Math.round(despesa * 100)) / 100, temDados: itens.length > 0 }
}

export const compararCategorias = (atual, anterior, categorias) => {
  const mapa = new Map()
  for (const [itens, campo] of [[atual, 'total'], [anterior, 'anterior']]) {
    for (const item of itens) {
      if (item.tipo !== 'despesa') continue
      const categoria = encontrarCategoria(categorias, item)
      if (!categoria) continue
      const chave = categoria.uuid || categoria.id
      const grupo = mapa.get(chave) || { ...categoria, total: 0, anterior: 0 }
      grupo[campo] += Math.round(Number(item.valor || 0) * 100)
      mapa.set(chave, grupo)
    }
  }
  const total = resumirMes(atual).despesa
  return [...mapa.values()].map((c) => ({ ...c, total: c.total / 100, anterior: c.anterior / 100,
    percentual: total > 0 ? c.total / total : 0 })).sort((a, b) => b.total - a.total || b.anterior - a.anterior)
}

export const variacaoMensal = (atual, anterior, temDados = true) => {
  if (!temDados) return 'Sem histórico'
  if (anterior === 0) return atual === 0 ? 'Sem variação' : 'Sem base percentual'
  const percentual = (atual - anterior) / Math.abs(anterior) * 100
  if (Math.abs(percentual) < 0.05) return 'Sem variação'
  return `${percentual > 0 ? '+' : ''}${percentual.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}
