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
const DEBOUNCE_SYNC = 2500
const INTERVALO_MINIMO_PULL_INICIAL = 1000 * 20

let sincronizando = false
let pullInicialExecutando = false
let intervaloAtivo = null
let debounceTimer = null
let autoSyncIniciado = false

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

const salvarUltimoPull = (tabela, dataISO) => {
  localStorage.setItem(obterChaveUltimoPull(tabela), dataISO)
}

const obterMapaUltimosPulls = () => {
  return TABELAS.reduce((mapa, tabela) => {
    mapa[tabela] = obterUltimoPull(tabela)
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

  const resposta = await fetch(url.toString(), {
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

      const resposta = await fetch(API_URL, {
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

      if (dados.sucesso) {
        const agoraSync = new Date().toISOString()

        for (const item of pendentes) {
          await db[tabela]
            .where('uuid')
            .equals(item.uuid)
            .modify({
              syncStatus: 'synced',
              lastSyncedAt: agoraSync
            })
        }

        infoTabela.enviados = pendentes.length
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
      const updatedAfter = obterUltimoPull(tabela)

      const url = new URL(API_URL)
      url.searchParams.set('tabela', tabela)
      url.searchParams.set('secret', API_SECRET || '')

      if (updatedAfter) {
        url.searchParams.set('updatedAfter', updatedAfter)
      }

      const resposta = await fetch(url.toString(), {
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

  const resposta = await fetch(url.toString(), {
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
      sincronizando: false,
      ultimoErro: null
    })

    return {
      sucesso: false,
      erro: 'offline',
      etapa: 'pull-inicial'
    }
  }

  if (pullInicialExecutando) {
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
    sincronizando: true,
    ultimoErro: null
  })

  try {
    const check = await checkChangesSync()

    const tabelasComMudanca = TABELAS.filter((tabela) => check.changes[tabela])

    if (tabelasComMudanca.length === 0) {
      salvarMetaLocal(check.meta)
      salvarUltimoPullInicial()

      atualizarEstadoGlobalSync({
        sincronizando: false,
        ultimaSincronizacao: new Date().toISOString(),
        ultimoErro: null
      })

      return {
        sucesso: true,
        etapa: 'pull-inicial',
        semAlteracoes: true,
        check
      }
    }

    const pull = await pullBatchSync(tabelasComMudanca)

    atualizarEstadoGlobalSync({
      sincronizando: false,
      ultimaSincronizacao: pull.sucesso
        ? new Date().toISOString()
        : obterStatusSync().ultimaSincronizacao,
      ultimoErro: pull.sucesso ? null : 'Falha ao atualizar dados na abertura.'
    })

    if (pull.sucesso) {
      salvarUltimoPullInicial()
    }

    return {
      sucesso: pull.sucesso,
      etapa: 'pull-inicial',
      tabelasComMudanca,
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
      sincronizando: false,
      ultimoErro: null
    })

    return {
      sucesso: false,
      erro: 'offline',
      push: null,
      pull: null
    }
  }

  if (sincronizando) {
    return {
      sucesso: true,
      ignorado: true,
      motivo: 'Sincronização já em andamento.'
    }
  }

  sincronizando = true

  atualizarEstadoGlobalSync({
    sincronizando: true,
    ultimoErro: null
  })

  try {
    const push = await pushSync()
    const pull = await pullSync()
    const sucesso = push.sucesso && pull.sucesso

    atualizarEstadoGlobalSync({
      sincronizando: false,
      ultimaSincronizacao: sucesso
        ? new Date().toISOString()
        : obterStatusSync().ultimaSincronizacao,
      ultimoErro: sucesso ? null : 'Falha parcial na sincronização.'
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
    executarPullInicial()
  }, DEBOUNCE_SYNC)
}


export const restaurarBaseLocalDoSheets = async () => {
  const config = verificarConfiguracaoSync()

  if (!config.ok) {
    throw new Error(config.erro)
  }

  atualizarEstadoGlobalSync({
    sincronizando: true,
    ultimoErro: null
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

    const resposta = await fetch(url.toString(), {
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
        const local = prepararRegistroParaLocal(registro)
        await db[tabela].add(local)
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
    executarSync()
  }

  window.addEventListener('online', () => {
    atualizarEstadoGlobalSync({
      online: true,
      sincronizando: false,
      ultimoErro: null
    })

    executarSync()
  })

  window.addEventListener('offline', () => {
    atualizarEstadoGlobalSync({
      online: false,
      sincronizando: false,
      ultimoErro: null
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