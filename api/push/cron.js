import webPush from 'web-push'

const API_URL = process.env.VITE_SHEETS_API_URL
const API_SECRET = process.env.VITE_API_SECRET
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT

webPush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
)

const hojeISO = () => {
  const agora = new Date()
  const brasil = new Date(
    agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  )

  return brasil.toISOString().slice(0, 10)
}

const adicionarDias = (dataISO, dias) => {
  const [ano, mes, dia] = dataISO.split('-').map(Number)
  const data = new Date(ano, mes - 1, dia)
  data.setDate(data.getDate() + dias)

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

const buscarJson = async (url) => {
  const resposta = await fetch(url)
  const texto = await resposta.text()
  const dados = texto ? JSON.parse(texto) : {}

  if (!resposta.ok || dados.erro) {
    throw new Error(dados.erro || `Erro HTTP ${resposta.status}`)
  }

  return dados
}

const buscarDadosFinanceiros = async () => {
  const url = new URL(API_URL)

  url.searchParams.set('secret', API_SECRET)
  url.searchParams.set('modo', 'pullBatch')
  url.searchParams.set('tabelas', 'lancamentos,cartoes')

  const dados = await buscarJson(url.toString())

  return {
    lancamentos: dados.tabelas?.lancamentos || [],
    cartoes: dados.tabelas?.cartoes || []
  }
}

const buscarSubscriptions = async () => {
  const url = new URL(API_URL)

  url.searchParams.set('secret', API_SECRET)
  url.searchParams.set('modo', 'getPushSubscriptions')

  const dados = await buscarJson(url.toString())

  return dados.subscriptions || []
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

const calcularAlertas = ({ lancamentos, cartoes }) => {
  const hoje = hojeISO()
  const limiteProximosDias = adicionarDias(hoje, 5)
  const mapaCartoes = montarMapaCartoes(cartoes)

  const lancamentosAtivos = lancamentos.filter((lancamento) => {
    return !estaDeletado(lancamento.deletedAt)
  })

  const despesasPendentes = lancamentosAtivos.filter((lancamento) => {
    return (
      normalizarStatus(lancamento.tipo) === 'despesa' &&
      normalizarStatus(lancamento.metodoPagamento) !== 'cartao' &&
      normalizarStatus(lancamento.status) === 'pendente'
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

  const faturas = new Map()

  lancamentosAtivos
    .filter((lancamento) => {
      const valorPago = Number(lancamento.faturaValorPago || 0)
      const valor = Number(lancamento.valor || 0)

      return (
        normalizarStatus(lancamento.tipo) === 'despesa' &&
        normalizarStatus(lancamento.metodoPagamento) === 'cartao' &&
        normalizarStatus(lancamento.status) === 'pendente' &&
        !estaFechada(lancamento.faturaFechada) &&
        valorPago < valor &&
        lancamento.faturaRef
      )
    })
    .forEach((lancamento) => {
      const chaveCartao = lancamento.cartaoUuid || lancamento.cartaoId
      const chave = `${chaveCartao || 'sem-cartao'}-${lancamento.faturaRef}`

      const atual = faturas.get(chave) || {
        cartaoId: lancamento.cartaoId,
        cartaoUuid: lancamento.cartaoUuid,
        faturaRef: lancamento.faturaRef,
        total: 0
      }

      atual.total += Number(lancamento.valor || 0)
      faturas.set(chave, atual)
    })

  const faturasLista = Array.from(faturas.values()).map((fatura) => {
    const cartao =
      mapaCartoes.get(String(fatura.cartaoUuid || '')) ||
      mapaCartoes.get(String(fatura.cartaoId || ''))

    return {
      ...fatura,
      vencimento: montarDataVencimentoFatura(fatura.faturaRef, cartao?.diaVencimento)
    }
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

const enviarPush = async (subscription, payload) => {
  return webPush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys?.p256dh,
        auth: subscription.keys?.auth
      }
    },
    JSON.stringify(payload)
  )
}

export default async function handler(req, res) {
  try {
    if (!API_URL || !API_SECRET) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Variáveis VITE_SHEETS_API_URL ou VITE_API_SECRET não configuradas.'
      })
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Variáveis VAPID não configuradas.'
      })
    }

    const [subscriptions, dadosFinanceiros] = await Promise.all([
      buscarSubscriptions(),
      buscarDadosFinanceiros()
    ])

    const alertas = calcularAlertas(dadosFinanceiros)

    if (!alertas.deveNotificar) {
      return res.status(200).json({
        sucesso: true,
        notificou: false,
        motivo: 'Nenhum alerta financeiro encontrado.',
        subscriptions: subscriptions.length,
        resumo: alertas.resumo
      })
    }

    const payload = {
      title: alertas.titulo,
      body: alertas.corpo,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      url: '/',
      tag: `financeapp-alertas-${hojeISO()}`,
      requireInteraction: false
    }

    const envios = await Promise.allSettled(
      subscriptions.map((subscription) => enviarPush(subscription, payload))
    )

    const enviados = envios.filter((item) => item.status === 'fulfilled').length
    const falhas = envios.filter((item) => item.status === 'rejected').length

    return res.status(200).json({
      sucesso: true,
      notificou: enviados > 0,
      enviados,
      falhas,
      subscriptions: subscriptions.length,
      resumo: alertas.resumo,
      mensagem: alertas.corpo
    })
  } catch (err) {
    return res.status(500).json({
      sucesso: false,
      erro: err.message
    })
  }
}