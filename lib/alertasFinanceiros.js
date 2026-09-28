export const hojeISO = (agora = new Date()) => {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(agora)
  const campo = (tipo) => partes.find((parte) => parte.type === tipo).value
  return campo('year') + '-' + campo('month') + '-' + campo('day')
}

const adicionarDias = (dataISO, dias) => {
  const [ano, mes, dia] = dataISO.split('-').map(Number)
  const data = new Date(Date.UTC(ano, mes - 1, dia))
  data.setUTCDate(data.getUTCDate() + dias)

  return data.toISOString().slice(0, 10)
}

const ultimoDiaDoMes = (ano, mes) => {
  return new Date(ano, mes, 0).getDate()
}

const montarDataVencimentoFatura = (faturaRef, diaVencimento) => {
  if (!faturaRef || !diaVencimento) return ''

  const [ano, mes] = String(faturaRef).split('-').map(Number)

  if (!ano || !mes) return ''

  const diaSeguro = Math.min(Number(diaVencimento), ultimoDiaDoMes(ano, mes))

  return `${ano}-${String(mes).padStart(2, '0')}-${String(diaSeguro).padStart(2, '0')}`
}

const formatarMoeda = (valor) => {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
}

const montarMapaCartoes = (cartoes) => {
  const mapa = new Map()

  cartoes.forEach((cartao) => {
    if (cartao.uuid) mapa.set(String(cartao.uuid), cartao)
    if (cartao.id) mapa.set(String(cartao.id), cartao)
  })

  return mapa
}

const normalizarData = (valor) => {
  if (!valor) return ''

  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor.toISOString().slice(0, 10)
  }

  const texto = String(valor).trim()

  if (!texto) return ''

  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) {
    return texto.slice(0, 10)
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(texto)) {
    const [dia, mes, ano] = texto.split('/')
    return `${ano}-${mes}-${dia}`
  }

  return ''
}

const normalizarStatus = (valor) => {
  return String(valor || '').trim().toLowerCase()
}

const estaDeletado = (valor) => {
  const texto = String(valor || '').trim()
  return texto !== ''
}

const estaFechada = (valor) => {
  const texto = String(valor || '').trim().toLowerCase()
  return texto === 'true' || texto === 'sim' || texto === '1'
}

const formatarDataCurta = (dataISO) => {
  if (!dataISO || !String(dataISO).includes('-')) return ''

  const [ano, mes, dia] = String(dataISO).split('-')

  return `${dia}/${mes}`
}

const formatarNomeFatura = (faturaRef) => {
  if (!faturaRef || !String(faturaRef).includes('-')) return 'Fatura'

  const [ano, mes] = String(faturaRef).split('-').map(Number)
  const data = new Date(ano, mes - 1, 1)
  const nomeMes = data.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')

  return `${nomeMes}/${String(ano).slice(-2)}`
}

const nomeCartao = (fatura, mapaCartoes) => {
  const cartao =
    mapaCartoes.get(String(fatura.cartaoUuid || '')) ||
    mapaCartoes.get(String(fatura.cartaoId || ''))

  return cartao?.nome || 'Cartão'
}

export const calcularAlertas = ({ lancamentos, cartoes }, hoje = hojeISO()) => {
  const limiteProximosDias = adicionarDias(hoje, 5)
  const mapaCartoes = montarMapaCartoes(cartoes)

  const lancamentosAtivos = lancamentos.filter((lancamento) => {
    return !estaDeletado(lancamento.deletedAt)
  })

  const despesasPendentes = lancamentosAtivos.filter((lancamento) => {
    return (
      normalizarStatus(lancamento.tipo) === 'despesa' &&
      normalizarStatus(lancamento.metodoPagamento) !== 'cartao' &&
      normalizarStatus(lancamento.status) === 'pendente' &&
      !normalizarData(lancamento.dataPagamento)
    )
  })

  const vencidas = despesasPendentes.filter((lancamento) => {
    const data = normalizarData(lancamento.dataCompetencia)
    return data && data < hoje
  })

  const vencendoHoje = despesasPendentes.filter((lancamento) => {
    const data = normalizarData(lancamento.dataCompetencia)
    return data && data === hoje
  })

  const vencendoProximosDias = despesasPendentes.filter((lancamento) => {
    const data = normalizarData(lancamento.dataCompetencia)
    return data && data > hoje && data <= limiteProximosDias
  })

  // O pagamento é o acumulado da fatura, repetido em cada compra.
  // Agrupar antes de avaliar quitação evita alertar itens de uma fatura paga.
  const faturas = new Map()
  for (const item of lancamentosAtivos) {
    if (normalizarStatus(item.tipo) !== 'despesa' ||
        normalizarStatus(item.metodoPagamento) !== 'cartao' || !item.faturaRef) continue
    const cartao = mapaCartoes.get(String(item.cartaoUuid || '')) ||
      mapaCartoes.get(String(item.cartaoId || ''))
    const referencia = String(item.faturaRef).slice(0, 7)
    const chaveCartao = cartao?.uuid || item.cartaoUuid || cartao?.id || item.cartaoId || 'sem-cartao'
    const chave = chaveCartao + '-' + referencia
    const grupo = faturas.get(chave) || {
      cartaoUuid: cartao?.uuid || item.cartaoUuid,
      cartaoId: cartao?.id || item.cartaoId,
      faturaRef: referencia, totalCentavos: 0, pagoCentavos: 0,
      pagoPorStatusCentavos: 0, fechada: false
    }
    const valorCentavos = Math.round(Number(item.valor || 0) * 100)
    grupo.totalCentavos += valorCentavos
    grupo.pagoCentavos = Math.max(grupo.pagoCentavos, Math.round(Number(item.faturaValorPago || 0) * 100))
    if (normalizarStatus(item.status) === 'pago' || normalizarData(item.dataPagamento)) {
      grupo.pagoPorStatusCentavos += valorCentavos
    }
    grupo.fechada ||= estaFechada(item.faturaFechada)
    faturas.set(chave, grupo)
  }

  const faturasLista = Array.from(faturas.values()).flatMap((fatura) => {
    const saldoCentavos = fatura.totalCentavos - Math.max(fatura.pagoCentavos, fatura.pagoPorStatusCentavos)
    if (fatura.fechada || saldoCentavos <= 0) return []
    const cartao = mapaCartoes.get(String(fatura.cartaoUuid || '')) ||
      mapaCartoes.get(String(fatura.cartaoId || ''))
    return [{ ...fatura, total: saldoCentavos / 100,
      vencimento: montarDataVencimentoFatura(fatura.faturaRef, cartao?.diaVencimento) }]
  })

  const faturasVencidas = faturasLista.filter((fatura) => {
    return fatura.vencimento && fatura.vencimento < hoje
  })

  const faturasVencendoProximosDias = faturasLista.filter((fatura) => {
    return fatura.vencimento && fatura.vencimento >= hoje && fatura.vencimento <= limiteProximosDias
  })

  const totalVencidas = vencidas.reduce((total, item) => total + Number(item.valor || 0), 0)
  const totalHoje = vencendoHoje.reduce((total, item) => total + Number(item.valor || 0), 0)
  const totalProximosDias = vencendoProximosDias.reduce((total, item) => total + Number(item.valor || 0), 0)
  const totalFaturasVencidas = faturasVencidas.reduce((total, item) => total + Number(item.total || 0), 0)
  const totalFaturasProximosDias = faturasVencendoProximosDias.reduce((total, item) => total + Number(item.total || 0), 0)

  const partes = []

const adicionarGrupo = (titulo, itens) => {
  if (itens.length === 0) return

  partes.push(`${titulo}:`)

  itens.forEach((item) => {
    partes.push(`• ${item.nome}: ${formatarMoeda(item.valor)}`)
  })
}

adicionarGrupo(
  'Vencidas',
  vencidas.map((item) => ({
    nome: `${item.descricao || 'Despesa'} (${formatarDataCurta(normalizarData(item.dataCompetencia))})`,
    valor: Number(item.valor || 0)
  }))
)

adicionarGrupo(
  'Vencendo hoje',
  vencendoHoje.map((item) => ({
    nome: `${item.descricao || 'Despesa'} (${formatarDataCurta(normalizarData(item.dataCompetencia))})`,
    valor: Number(item.valor || 0)
  }))
)

adicionarGrupo(
  'Próximos 5 dias',
  vencendoProximosDias.map((item) => ({
    nome: `${item.descricao || 'Despesa'} (${formatarDataCurta(normalizarData(item.dataCompetencia))})`,
    valor: Number(item.valor || 0)
  }))
)

adicionarGrupo(
  'Faturas vencidas',
  faturasVencidas.map((item) => ({
    nome: `${nomeCartao(item, mapaCartoes)} ${formatarNomeFatura(item.faturaRef)} (${formatarDataCurta(item.vencimento)})`,
    valor: Number(item.total || 0)
  }))
)

adicionarGrupo(
  'Faturas próximos 5 dias',
  faturasVencendoProximosDias.map((item) => ({
    nome: `${nomeCartao(item, mapaCartoes)} ${formatarNomeFatura(item.faturaRef)} (${formatarDataCurta(item.vencimento)})`,
    valor: Number(item.total || 0)
  }))
)

const totalGeral =
  totalVencidas +
  totalHoje +
  totalProximosDias +
  totalFaturasVencidas +
  totalFaturasProximosDias

if (partes.length > 0) {
  partes.push(`Total: ${formatarMoeda(totalGeral)}`)
}

  return {
    deveNotificar: partes.length > 0,
    titulo: 'FinanceApp',
    corpo: partes.join(' • '),
    resumo: {
      vencidas: vencidas.length,
      vencendoHoje: vencendoHoje.length,
      vencendoProximosDias: vencendoProximosDias.length,
      faturasVencidas: faturasVencidas.length,
      faturasVencendoProximosDias: faturasVencendoProximosDias.length
    }
  }
}

