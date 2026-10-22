export const normalizarTexto = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export function mesFinanceiro(valor) {
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    valor = new Date(Date.UTC(1899, 11, 30) + Math.round(valor * 86400000)).toISOString()
  }
  const mes = String(valor || '').slice(0, 7)
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : null
}

// Minimal read-only snapshot, entirely on device. No sync credentials,
// observations, card numbers or user records are needed for these calculations.
export function prepararDados(lancamentos, categorias) {
  const vistos = new Set()
  return lancamentos.filter(r => !r.deletedAt).map(r => {
    const id = String(r.uuid || `local-${r.id}`)
    if (vistos.has(id)) throw new Error('Há lançamentos duplicados. Confira a sincronização antes de consultar.')
    vistos.add(id)
    const categoria = r.categoriaUuid
      ? categorias.find(c => c.uuid === r.categoriaUuid)
      : categorias.find(c => Number(c.id) === Number(r.categoriaId))
    const mes = mesFinanceiro(r.metodoPagamento === 'cartao' ? r.faturaRef : r.dataCompetencia)
    if (!mes || !Number.isFinite(Number(r.valor)) || r.valor === '' || r.valor == null || !['receita', 'despesa'].includes(r.tipo)) {
      throw new Error('Há lançamentos com data, tipo ou valor inválido. Confira o extrato antes de consultar.')
    }
    if (Number(r.totalParcelas) > 1 && (!Number.isInteger(Number(r.parcelaAtual)) || Number(r.parcelaAtual) < 1 || Number(r.parcelaAtual) > Number(r.totalParcelas))) {
      throw new Error('Há lançamentos com numeração de parcelas inválida. Confira o extrato antes de consultar.')
    }
    return { id, mes, tipo: r.tipo, descricao: String(r.descricao || 'Sem descrição').slice(0, 200),
      categoria: String(categoria?.nome || 'Sem categoria').slice(0, 100),
      centavos: Math.round(Number(r.valor) * 100),
      recorrente: r.recorrente === true || r.recorrente === 'true',
      parcela: Number(r.parcelaAtual) || 0, totalParcelas: Number(r.totalParcelas) || 0,
      parcelamento: String(r.parcelamentoId || id), beneficiario: String(r.beneficiario || '').slice(0, 80) }
  })
}

export const tipoGasto = r => r.totalParcelas > 1 ? 'parcelados' : r.recorrente ? 'fixos' : 'avulsos'

const camposLista = ['meses', 'categorias', 'excluirCategorias', 'descricoes', 'excluirDescricoes']
export function validarPlano(p) {
  if (!p || camposLista.some(k => !Array.isArray(p[k]) || p[k].length > 36 || p[k].some(v => typeof v !== 'string' || v.length > 200)) ||
    !p.meses.length || p.meses.some(m => !/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) ||
    !['despesa', 'receita'].includes(p.tipo) || !['todos', 'parcelados', 'fixos', 'avulsos'].includes(p.grupo) ||
    !['categorias', 'descricao', 'tipo', 'parcelas'].includes(p.agrupamento) || !['valor', 'termino'].includes(p.ordem) ||
    !(p.beneficiario === null || typeof p.beneficiario === 'string') ||
    !(p.esclarecimento === null || typeof p.esclarecimento === 'string')) throw new Error('Não foi possível interpretar os filtros. Reformule a pergunta.')
  return p
}

export function calcularConsulta(dados, plano) {
  const p = validarPlano(plano)
  const contem = (lista, v) => lista.some(x => normalizarTexto(x) === normalizarTexto(v))
  // Reject invented names rather than silently returning zero for an unknown filter.
  for (const [campo, atributo] of [['categorias', 'categoria'], ['excluirCategorias', 'categoria'], ['descricoes', 'descricao'], ['excluirDescricoes', 'descricao']]) {
    for (const nome of p[campo]) {
      if (!dados.some(r => normalizarTexto(r[atributo]) === normalizarTexto(nome))) throw new Error(`Filtro não encontrado: ${nome}. Use o nome cadastrado no app.`)
    }
  }
  const itens = dados.filter(r => r.tipo === p.tipo && p.meses.includes(r.mes) &&
    !['reembolso', 'reembolsos'].includes(normalizarTexto(r.categoria)) &&
    (!p.categorias.length || contem(p.categorias, r.categoria)) && !contem(p.excluirCategorias, r.categoria) &&
    (!p.descricoes.length || contem(p.descricoes, r.descricao)) && !contem(p.excluirDescricoes, r.descricao) &&
    (p.grupo === 'todos' || tipoGasto(r) === p.grupo) &&
    (!p.beneficiario || normalizarTexto(p.beneficiario) === normalizarTexto(r.beneficiario)))
  const grupos = new Map()
  for (const r of itens) {
    const nome = p.agrupamento === 'categorias' ? r.categoria : p.agrupamento === 'tipo' ? tipoGasto(r) : r.descricao
    const chave = `${r.mes}|${p.agrupamento === 'parcelas' ? r.parcelamento : p.agrupamento === 'tipo' ? nome : `${r.categoria}|${nome}`}`
    const g = grupos.get(chave) || { nome, categoria: r.categoria, mes: r.mes, centavos: 0, quantidade: 0, parcela: null, totalParcelas: null, restantes: null, parcelasNoMes: [] }
    g.centavos += r.centavos
    g.quantidade++
    if (p.agrupamento === 'parcelas' && r.totalParcelas > 1) {
      g.parcela = Math.max(g.parcela || 0, r.parcela)
      g.totalParcelas = r.totalParcelas
      g.restantes = Math.max(0, r.totalParcelas - g.parcela)
      g.parcelasNoMes.push(r.parcela)
    }
    grupos.set(chave, g)
  }
  const linhas = [...grupos.values()].sort((a, b) => a.mes.localeCompare(b.mes) ||
    (p.ordem === 'termino' ? (a.restantes ?? Infinity) - (b.restantes ?? Infinity) : b.centavos - a.centavos) || a.nome.localeCompare(b.nome))
  return { totalCentavos: itens.reduce((s, r) => s + r.centavos, 0), quantidade: itens.length, linhas,
    totaisMes: p.meses.map(mes => ({ mes, centavos: itens.filter(r => r.mes === mes).reduce((s, r) => s + r.centavos, 0) })),
    aviso: 'Base deste aparelho no momento da pergunta. Inclui pagos e pendentes; reembolsos excluídos. Cartão pelo mês da fatura; demais pela competência. Fixos seguem o cadastro de recorrência. Parcelas restantes são contadas após as lançadas no mês.' }
}
