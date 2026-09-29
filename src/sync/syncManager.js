import { compararPagamentos, podeReenviarPagamento, mesmoPagamento } from './verificarPagamentos.js'
import { confirmarRegistroEnviado } from './confirmarRegistroEnviado.js'
import { db } from '../db/database'

const API_URL = import.meta.env.VITE_SHEETS_API_URL
const API_SECRET = import.meta.env.VITE_API_SECRET

const TABELAS = [
  'usuarios',
  'cartoes',
  'lancamentos',
  'faturas',
  'categorias',
  'subcategorias',
  'metas'
]

const INTERVALO_SYNC = 1000 * 60
const DEBOUNCE_SYNC = 800
const INTERVALO_MINIMO_PULL_INICIAL = 1000 * 20

let sincronizando = false
let pullInicialExecutando = false
let intervaloAtivo = null
let debounceTimer = null
let autoSyncIniciado = false
let conferenciaEmAndamento = false

const requisitarApi = async (url, opcoes = {}) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60000)
  const abortar = () => controller.abort()
  if (opcoes.signal?.aborted) abortar()
  opcoes.signal?.addEventListener('abort', abortar, { once: true })
  try {
    const resposta = await fetch(url, { ...opcoes, cache: 'no-store', signal: controller.signal })
    const texto = await resposta.text()
    return { ok: resposta.ok, status: resposta.status, text: async () => texto }
  } catch (erro) {
    if (erro.name === 'AbortError') {
      throw new Error(opcoes.method === 'POST'
        ? 'O envio demorou além do limite. Ele pode ter sido recebido; confira o servidor antes de repetir.'
        : 'A consulta não terminou em 60 segundos. Seus dados locais foram preservados; tente novamente mais tarde.')
    }
    throw erro
  } finally {
    clearTimeout(timeout)
    opcoes.signal?.removeEventListener('abort', abortar)
  }
}

const reservarConferencia = async () => {
  if (conferenciaEmAndamento) throw new Error('Já existe uma conferência em andamento.')
  conferenciaEmAndamento = true
  const limite = Date.now() + 120000
  try {
    while (sincronizando || pullInicialExecutando) {
      if (Date.now() > limite) throw new Error('A sincronização anterior ainda não terminou. Aguarde e tente novamente.')
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  } catch (erro) {
    conferenciaEmAndamento = false
    throw erro
  }
}

const obterDeviceId = () => {
  let deviceId = localStorage.getItem('financeapp_device_id')

  if (!deviceId) {
    deviceId = crypto.randomUUID()
    localStorage.setItem('financeapp_device_id', deviceId)
  }

  return deviceId
}

const verificarConfiguracaoSync = () => {
  if (!API_URL || API_URL === 'undefined') {
    return {
      ok: false,
      erro: 'VITE_SHEETS_API_URL não configurada.'
    }
  }

  return {
    ok: true,
    erro: null
  }
}

const obterChaveUltimoPull = (tabela) => {
  return `financeapp_ultimo_pull_${tabela}`
}

const obterUltimoPull = (tabela) => {
  return localStorage.getItem(obterChaveUltimoPull(tabela)) || ''
}

const obterUpdatedAfterSeguro = (tabela) => {
  const ultimoPull = obterUltimoPull(tabela)

  if (!ultimoPull) return ''

  const data = new Date(ultimoPull)
  data.setMinutes(data.getMinutes() - 10)

  return data.toISOString()
}

const salvarUltimoPull = (tabela, dataISO) => {
  localStorage.setItem(obterChaveUltimoPull(tabela), dataISO)
}

const obterMapaUltimosPulls = () => {
  return TABELAS.reduce((mapa, tabela) => {
   mapa[tabela] = obterUpdatedAfterSeguro(tabela)
    return mapa
  }, {})
}

const CHAVE_META_LOCAL = 'financeapp_sync_meta_local'
const CHAVE_ULTIMO_PULL_INICIAL = 'financeapp_ultimo_pull_inicial'

const obterMetaLocal = () => {
  const bruto = localStorage.getItem(CHAVE_META_LOCAL)

  if (!bruto) return {}

  try {
    return JSON.parse(bruto)
  } catch {
    return {}
  }
}

const salvarMetaLocal = (meta) => {
  localStorage.setItem(CHAVE_META_LOCAL, JSON.stringify(meta || {}))
}

const obterUltimoPullInicial = () => {
  return localStorage.getItem(CHAVE_ULTIMO_PULL_INICIAL) || ''
}

const salvarUltimoPullInicial = () => {
  localStorage.setItem(CHAVE_ULTIMO_PULL_INICIAL, new Date().toISOString())
}

const lerRespostaJson = async (resposta) => {
  const texto = await resposta.text()

  if (!texto) return {}

  try {
    return JSON.parse(texto)
  } catch {
    throw new Error(`Resposta inválida da API: ${texto.slice(0, 300)}`)
  }
}

const atualizarEstadoGlobalSync = (dados) => {
  const statusAnterior = obterStatusSync()

  localStorage.setItem(
    'financeapp_sync_status',
    JSON.stringify({
      ...statusAnterior,
      ...dados,
      online: navigator.onLine,
      atualizadoEm: new Date().toISOString()
    })
  )

  window.dispatchEvent(new Event('financeapp-sync-status'))
}

export const obterStatusSync = () => {
  const bruto = localStorage.getItem('financeapp_sync_status')

  if (!bruto) {
    return {
      online: navigator.onLine,
      sincronizando: false,
      ultimaSincronizacao: null,
      ultimoErro: null
    }
  }

  try {
    return JSON.parse(bruto)
  } catch {
    return {
      online: navigator.onLine,
      sincronizando: false,
      ultimaSincronizacao: null,
      ultimoErro: null
    }
  }
}

const registrarLogSync = async (tabela, uuid, action, localData, remoteData) => {
  await db.syncLog.add({
    tabela,
    uuid,
    action,
    timestamp: new Date().toISOString(),
    deviceId: obterDeviceId(),
    resolved: false,
    localData: JSON.stringify(localData || {}),
    remoteData: JSON.stringify(remoteData || {})
  })
}

const removerIdLocal = (registro) => {
  const copia = { ...registro }
  delete copia.id
  return copia
}

const prepararRegistroParaRemote = (registro) => {
  return {
    ...registro,
    syncStatus: 'synced',
    lastSyncedAt: new Date().toISOString()
  }
}

const prepararRegistroParaLocal = (registro) => {
  const semId = removerIdLocal(registro)

  return {
    ...semId,
    syncStatus: 'synced',
    lastSyncedAt: new Date().toISOString()
  }
}

const aplicarRegistrosRemotosNaTabela = async (tabela, remotos) => {
  const infoTabela = {
    tabela,
    recebidos: Array.isArray(remotos) ? remotos.length : 0,
    novos: 0,
    atualizados: 0,
    conflitos: 0,
    erro: null
  }

  if (!Array.isArray(remotos) || remotos.length === 0) {
    return {
      infoTabela,
      maiorUpdatedAt: obterUltimoPull(tabela)
    }
  }

  let maiorUpdatedAt = obterUltimoPull(tabela)

  const locais = await db[tabela].toArray()
  const mapaLocaisPorUuid = new Map()

  for (const local of locais) {
    if (local.uuid) {
      mapaLocaisPorUuid.set(local.uuid, local)
    }
  }

  for (const remoto of remotos) {
    if (!remoto.uuid) continue

    if (remoto.updatedAt && (!maiorUpdatedAt || remoto.updatedAt > maiorUpdatedAt)) {
      maiorUpdatedAt = remoto.updatedAt
    }

    const local = mapaLocaisPorUuid.get(remoto.uuid)
    const remotoNormalizado = prepararRegistroParaLocal(remoto)

    if (!local) {
      await db[tabela].add(remotoNormalizado)
      infoTabela.novos++
      continue
    }

    // Preserve unresolved local edits without logging the same conflict every cycle.
    if (local.syncStatus === 'conflict') {
      infoTabela.conflitos++
      continue
    }

    const localTemAlteracao = local.syncStatus === 'pending'

    const remotoMaisNovo =
      remoto.updatedAt &&
      local.updatedAt &&
      new Date(remoto.updatedAt).getTime() > new Date(local.updatedAt).getTime()

    if (localTemAlteracao && remotoMaisNovo) {
      await db[tabela]
        .where('uuid')
        .equals(remoto.uuid)
        .modify({
          syncStatus: 'conflict'
        })

      await registrarLogSync(tabela, remoto.uuid, 'conflict', local, remoto)
      infoTabela.conflitos++
      continue
    }

    if (!localTemAlteracao && remotoMaisNovo) {
      await db[tabela]
        .where('uuid')
        .equals(remoto.uuid)
        .modify(remotoNormalizado)

      infoTabela.atualizados++
    }
  }

  return {
    infoTabela,
    maiorUpdatedAt
  }
}

const checkChangesSync = async () => {
  const url = new URL(API_URL)

  url.searchParams.set('modo', 'checkChanges')
  url.searchParams.set('secret', API_SECRET || '')
  url.searchParams.set('meta', JSON.stringify(obterMetaLocal()))

  const resposta = await requisitarApi(url.toString(), {
    method: 'GET'
  })

  const dados = await lerRespostaJson(resposta)

  if (!resposta.ok || dados.erro) {
    throw new Error(dados.erro || `Erro HTTP ${resposta.status}`)
  }

  if (!dados.sucesso || !dados.changes || !dados.meta) {
    throw new Error('Resposta inesperada no checkChanges.')
  }

  return dados
}

export const pushSync = async () => {
  const resultado = {
    sucesso: true,
    etapa: 'push',
    tabelas: []
  }

  for (const tabela of TABELAS) {
    const pendentes = await db[tabela]
      .where('syncStatus')
      .equals('pending')
      .toArray()

    const infoTabela = {
      tabela,
      pendentes: pendentes.length,
      enviados: 0,
      erro: null
    }

    if (pendentes.length === 0) {
      resultado.tabelas.push(infoTabela)
      continue
    }

    try {
      const registrosParaRemote = pendentes.map(prepararRegistroParaRemote)

      const resposta = await requisitarApi(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify({
          secret: API_SECRET,
          tabela,
          registros: registrosParaRemote,
          deviceId: obterDeviceId()
        })
      })

      const dados = await lerRespostaJson(resposta)

      if (!resposta.ok || dados.erro) {
        throw new Error(dados.erro || `Erro HTTP ${resposta.status}`)
      }

      if (dados.sucesso !== true) throw new Error('O servidor não confirmou o recebimento dos registros.')

      if (dados.sucesso) {
        const divergencias = tabela === 'lancamentos'
          ? compararPagamentos(pendentes, await buscarLancamentosParaConferencia()) : []
        const naoConfirmados = new Set(divergencias.map(item => item.uuid))
        const agoraSync = new Date().toISOString()

        for (const item of pendentes) {
          if (naoConfirmados.has(item.uuid)) continue
          await db[tabela]
            .where('uuid')
            .equals(item.uuid)
            .modify((local) => {
              confirmarRegistroEnviado(local, item, agoraSync)
            })
        }

        infoTabela.enviados = pendentes.length - naoConfirmados.size
        if (naoConfirmados.size) throw new Error(`${naoConfirmados.size} lançamento(s) enviados, mas não confirmados na base das notificações.`)
      }
    } catch (err) {
      infoTabela.erro = err.message
      resultado.sucesso = false
      console.error(`Erro no push da tabela ${tabela}:`, err)
    }

    resultado.tabelas.push(infoTabela)
  }

  return resultado
}

export const pullSync = async () => {
  const resultado = {
    sucesso: true,
    etapa: 'pull',
    tabelas: []
  }

  for (const tabela of TABELAS) {
    try {
      const updatedAfter = obterUpdatedAfterSeguro(tabela)

      const url = new URL(API_URL)
      url.searchParams.set('tabela', tabela)
      url.searchParams.set('secret', API_SECRET || '')

      if (updatedAfter) {
        url.searchParams.set('updatedAfter', updatedAfter)
      }

      const resposta = await requisitarApi(url.toString(), {
        method: 'GET'
      })

      const remotos = await lerRespostaJson(resposta)

      if (!resposta.ok || remotos.erro) {
        throw new Error(remotos.erro || `Erro HTTP ${resposta.status}`)
      }

      if (!Array.isArray(remotos)) {
        throw new Error(`Resposta inesperada no pull da tabela ${tabela}`)
      }

      const { infoTabela, maiorUpdatedAt } = await aplicarRegistrosRemotosNaTabela(tabela, remotos)

      if (maiorUpdatedAt) {
        salvarUltimoPull(tabela, maiorUpdatedAt)
      }

      resultado.tabelas.push(infoTabela)
    } catch (err) {
      resultado.sucesso = false

      resultado.tabelas.push({
        tabela,
        recebidos: 0,
        novos: 0,
        atualizados: 0,
        conflitos: 0,
        erro: err.message
      })

      console.error(`Erro no pull da tabela ${tabela}:`, err)
    }
  }

  return resultado
}

export const pullBatchSync = async (tabelasSolicitadas = TABELAS) => {
  const resultado = {
    sucesso: true,
    etapa: 'pullBatch',
    tabelas: []
  }

  const url = new URL(API_URL)

  url.searchParams.set('modo', 'pullBatch')
  url.searchParams.set('secret', API_SECRET || '')
  url.searchParams.set(
    'updatedAfterMap',
    JSON.stringify(obterMapaUltimosPulls())
  )
  url.searchParams.set('tabelas', tabelasSolicitadas.join(','))

  const resposta = await requisitarApi(url.toString(), {
    method: 'GET'
  })

  const dados = await lerRespostaJson(resposta)

  if (!resposta.ok || dados.erro) {
    throw new Error(dados.erro || `Erro HTTP ${resposta.status}`)
  }

  if (!dados.sucesso || !dados.tabelas) {
    throw new Error('Resposta inesperada no pull em lote.')
  }

  for (const tabela of tabelasSolicitadas) {
    try {
      const remotos = dados.tabelas[tabela] || []
      const { infoTabela, maiorUpdatedAt } = await aplicarRegistrosRemotosNaTabela(tabela, remotos)

      if (maiorUpdatedAt) {
        salvarUltimoPull(tabela, maiorUpdatedAt)
      }

      resultado.tabelas.push(infoTabela)
    } catch (err) {
      resultado.sucesso = false

      resultado.tabelas.push({
        tabela,
        recebidos: 0,
        novos: 0,
        atualizados: 0,
        conflitos: 0,
        erro: err.message
      })

      console.error(`Erro ao aplicar pullBatch da tabela ${tabela}:`, err)
    }
  }

  if (dados.meta) {
    salvarMetaLocal(dados.meta)
  }

  return resultado
}

export const executarPullInicial = async () => {
  const config = verificarConfiguracaoSync()

  if (!config.ok) {
    atualizarEstadoGlobalSync({
      sincronizando: false,
      ultimoErro: config.erro
    })

    return {
      sucesso: false,
      erro: config.erro,
      etapa: 'pull-inicial'
    }
  }

  if (!navigator.onLine) {
    atualizarEstadoGlobalSync({
      online: false,
      sincronizando: false
    })

    return {
      sucesso: false,
      erro: 'offline',
      etapa: 'pull-inicial'
    }
  }

  if (pullInicialExecutando || sincronizando || conferenciaEmAndamento) {
    return {
      sucesso: true,
      ignorado: true,
      motivo: 'Pull inicial já em andamento.',
      etapa: 'pull-inicial'
    }
  }

  const ultimoPullInicial = obterUltimoPullInicial()

  if (ultimoPullInicial) {
    const tempoDesdeUltimoPull = Date.now() - new Date(ultimoPullInicial).getTime()

    if (tempoDesdeUltimoPull < INTERVALO_MINIMO_PULL_INICIAL) {
      return {
        sucesso: true,
        ignorado: true,
        motivo: 'Pull inicial executado recentemente.',
        etapa: 'pull-inicial'
      }
    }
  }

  pullInicialExecutando = true

  atualizarEstadoGlobalSync({
    online: true,
    sincronizando: true
  })

  try {
  const pull = await pullBatchSync(TABELAS)

  atualizarEstadoGlobalSync({
    sincronizando: false,
    ultimaLeitura: pull.sucesso ? new Date().toISOString() : obterStatusSync().ultimaLeitura,
    ultimoErro: pull.sucesso ? obterStatusSync().ultimoErro : 'Falha ao atualizar dados na abertura.'
  })

  if (pull.sucesso) {
    salvarUltimoPullInicial()
  }

  return {
    sucesso: pull.sucesso,
    etapa: 'pull-inicial',
    pull
  }
} catch (err) {
  atualizarEstadoGlobalSync({
    sincronizando: false,
    ultimoErro: err.message
  })

  return {
    sucesso: false,
    erro: err.message,
    etapa: 'pull-inicial'
  }
} finally {
    pullInicialExecutando = false
  }
}

export const executarSync = async () => {
  const config = verificarConfiguracaoSync()

  if (!config.ok) {
    atualizarEstadoGlobalSync({
      sincronizando: false,
      ultimoErro: config.erro
    })

    return {
      sucesso: false,
      erro: config.erro,
      push: null,
      pull: null
    }
  }

  if (!navigator.onLine) {
    atualizarEstadoGlobalSync({
      online: false,
      sincronizando: false
    })

    return {
      sucesso: false,
      erro: 'offline',
      push: null,
      pull: null
    }
  }

  if (sincronizando || pullInicialExecutando || conferenciaEmAndamento) {
    return {
      sucesso: true,
      ignorado: true,
      motivo: 'Sincronização já em andamento.'
    }
  }

  sincronizando = true

  atualizarEstadoGlobalSync({
    sincronizando: true
  })

  try {
    const pullAntes = await pullBatchSync(TABELAS)
const push = await pushSync()
const pullDepois = push.tabelas.some(item => item.enviados > 0)
  ? await pullBatchSync(TABELAS)
  : { sucesso: true, tabelas: [] }

const pull = {
  sucesso: pullAntes.sucesso && pullDepois.sucesso,
  antes: pullAntes,
  depois: pullDepois
}

const pendencias = await contarPendenciasSync()
const sucesso = push.sucesso && pull.sucesso && !pendencias.pendentes && !pendencias.conflitos
const erroTabela = [...push.tabelas, ...pullAntes.tabelas, ...pullDepois.tabelas].find(item => item.erro)?.erro

    atualizarEstadoGlobalSync({
      sincronizando: false,
      ultimaSincronizacao: sucesso
        ? new Date().toISOString()
        : obterStatusSync().ultimaSincronizacao,
      ultimoErro: sucesso ? null : erroTabela || `${pendencias.pendentes} registro(s) aguardando envio e ${pendencias.conflitos} conflito(s).`,
      ...pendencias
    })

    return {
      sucesso,
      push,
      pull
    }
  } catch (err) {
    atualizarEstadoGlobalSync({
      sincronizando: false,
      ultimoErro: err.message
    })

    return {
      sucesso: false,
      erro: err.message,
      push: null,
      pull: null
    }
  } finally {
    sincronizando = false
  }
}

export const agendarSync = () => {
  if (!navigator.onLine) return

  clearTimeout(debounceTimer)

  debounceTimer = setTimeout(() => {
  executarSync()
}, DEBOUNCE_SYNC)
}


export const restaurarBaseLocalDoSheets = async () => {
  const config = verificarConfiguracaoSync()

  if (!config.ok) {
    throw new Error(config.erro)
  }

  atualizarEstadoGlobalSync({
    sincronizando: true
  })

  try {
    // limpa tabelas locais
    for (const tabela of TABELAS) {
      await db[tabela].clear()
    }

    await db.syncLog.clear()

    // limpa metas locais
    localStorage.removeItem(CHAVE_META_LOCAL)
    localStorage.removeItem(CHAVE_ULTIMO_PULL_INICIAL)

    TABELAS.forEach((tabela) => {
      localStorage.removeItem(obterChaveUltimoPull(tabela))
    })

    // baixa tudo do sheets
    const url = new URL(API_URL)

    url.searchParams.set('modo', 'pullBatch')
    url.searchParams.set('secret', API_SECRET || '')
    url.searchParams.set('tabelas', TABELAS.join(','))

    const resposta = await requisitarApi(url.toString(), {
      method: 'GET'
    })

    const dados = await lerRespostaJson(resposta)

    if (!resposta.ok || dados.erro) {
      throw new Error(dados.erro || `Erro HTTP ${resposta.status}`)
    }

    if (!dados.sucesso || !dados.tabelas) {
      throw new Error('Resposta inesperada na restauração.')
    }

    for (const tabela of TABELAS) {
      const registros = dados.tabelas[tabela] || []

      if (!Array.isArray(registros)) continue

      for (const registro of registros) {
        const local = prepararRegistroRestauracaoParaLocal(registro)
        await db[tabela].put(local)
      }

      const maiorUpdatedAt = registros.reduce((maior, item) => {
        if (!item.updatedAt) return maior
        return !maior || item.updatedAt > maior
          ? item.updatedAt
          : maior
      }, '')

      if (maiorUpdatedAt) {
        salvarUltimoPull(tabela, maiorUpdatedAt)
      }
    }

    if (dados.meta) {
      salvarMetaLocal(dados.meta)
    }

    salvarUltimoPullInicial()

    atualizarEstadoGlobalSync({
      sincronizando: false,
      ultimaSincronizacao: new Date().toISOString(),
      ultimoErro: null
    })

    return {
      sucesso: true
    }
  } catch (err) {
    atualizarEstadoGlobalSync({
      sincronizando: false,
      ultimoErro: err.message
    })

    throw err
  }
}


export const iniciarAutoSync = ({ executarAoIniciar = false } = {}) => {
  if (autoSyncIniciado) return

  autoSyncIniciado = true

  if (executarAoIniciar) {
  executarPullInicial()
}

  window.addEventListener('online', () => {
    atualizarEstadoGlobalSync({
      online: true,
      sincronizando: false
    })

    executarSync()
  })

  window.addEventListener('offline', () => {
    atualizarEstadoGlobalSync({
      online: false,
      sincronizando: false
    })
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      executarPullInicial()
    }
  })

  intervaloAtivo = setInterval(() => {
    if (navigator.onLine && document.visibilityState === 'visible') {
      executarSync()
    }
  }, INTERVALO_SYNC)
}

export const pararAutoSync = () => {
  if (intervaloAtivo) {
    clearInterval(intervaloAtivo)
    intervaloAtivo = null
  }

  clearTimeout(debounceTimer)
  autoSyncIniciado = false
}

const prepararRegistroRestauracaoParaLocal = (registro) => {
  const copia = { ...registro }

  if (copia.id !== undefined && copia.id !== '') {
    copia.id = Number(copia.id)
  }

  return {
    ...copia,
    syncStatus: 'synced',
    lastSyncedAt: new Date().toISOString()
  }
}
export const contarPendenciasSync = async () => {
  let pendentes = 0
  let conflitos = 0
  for (const tabela of TABELAS) {
    pendentes += await db[tabela].where('syncStatus').equals('pending').count()
    conflitos += await db[tabela].where('syncStatus').equals('conflict').count()
  }
  return { pendentes, conflitos }
}

const buscarLancamentosParaConferencia = async () => {
  const config = verificarConfiguracaoSync()
  if (!config.ok) throw new Error(config.erro)
  if (!navigator.onLine) throw new Error('Conecte-se à internet para conferir os pagamentos.')
  const url = new URL(API_URL)
  url.searchParams.set('secret', API_SECRET || '')
  url.searchParams.set('modo', 'pullBatch')
  url.searchParams.set('tabelas', 'lancamentos')
  url.searchParams.set('_conferencia', String(Date.now()))
  const resposta = await requisitarApi(url.toString())
  const dados = await lerRespostaJson(resposta)
  if (!resposta.ok || dados.erro || !Array.isArray(dados.tabelas?.lancamentos)) {
    throw new Error('Não foi possível confirmar os lançamentos na base das notificações.')
  }
  return dados.tabelas.lancamentos
}

// Read-only: never replace or erase the phone's payments during diagnosis.
export const conferirPagamentosServidor = async () => {
  await reservarConferencia()
  try {
    const remotos = await buscarLancamentosParaConferencia()
    const locais = (await db.lancamentos.toArray()).filter(item => !item.deletedAt)
    const divergencias = compararPagamentos(locais, remotos)
    const pendencias = await contarPendenciasSync()
    return { divergencias, ...pendencias, conferidos: locais.length, verificadoEm: new Date().toISOString() }
  } finally {
    conferenciaEmAndamento = false
  }
}

export const reenviarPagamentoConferido = async (divergencia) => {
  await reservarConferencia()
  sincronizando = true
  atualizarEstadoGlobalSync({ sincronizando: true })
  try {
    const remotos = await buscarLancamentosParaConferencia()
    const candidatos = remotos.filter(item => item.uuid === divergencia.uuid)
    const locais = await db.lancamentos.where('uuid').equals(divergencia.uuid).toArray()
    const local = locais[0], remoto = candidatos[0]
    if (locais.length !== 1 || candidatos.length !== 1 || !podeReenviarPagamento(local, remoto) ||
        local.updatedAt !== divergencia.local.atualizado || remoto.updatedAt !== divergencia.remoto?.atualizado) {
      throw new Error('O registro mudou desde a conferência. Confira novamente antes de reenviar.')
    }
    // Preserve all server fields; only apply the confirmed payment from this device.
    const enviado = { ...remoto, status: local.status, dataPagamento: local.dataPagamento,
      updatedAt: new Date().toISOString(), syncStatus: 'synced' }
    {
      const resposta = await requisitarApi(API_URL, { method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({secret:API_SECRET, tabela:'lancamentos', registros:[enviado], deviceId:obterDeviceId()}) })
      const dados = await lerRespostaJson(resposta)
      if (!resposta.ok || dados.erro || dados.sucesso !== true) throw new Error('O servidor não confirmou o recebimento do pagamento.')
    }
    const confirmados = (await buscarLancamentosParaConferencia()).filter(item => item.uuid === enviado.uuid)
    if (confirmados.length !== 1 || !mesmoPagamento(enviado, confirmados[0])) {
      throw new Error('O servidor recebeu o pedido, mas o pagamento ainda não foi confirmado na leitura. Seus dados locais foram preservados.')
    }
    await db.lancamentos.where('uuid').equals(local.uuid).modify(atual => {
      if (JSON.stringify(atual) !== JSON.stringify(local)) return
      atual.updatedAt = enviado.updatedAt
      atual.lastSyncedAt = new Date().toISOString()
    })
    return {sucesso:true}
  } finally {
    sincronizando = false
    conferenciaEmAndamento = false
    atualizarEstadoGlobalSync({ sincronizando: false })
  }
}
