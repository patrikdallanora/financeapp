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

const lerRespostaJson = async (resposta) => {
  const texto = await resposta.text()

  if (!texto) return {}

  try {
    return JSON.parse(texto)
  } catch {
    throw new Error(`Resposta inválida da API: ${texto.slice(0, 300)}`)
  }
}

const obterRegistrosParaPush = async (tabela, forcarTudo = false) => {
  if (forcarTudo) {
    const todos = await db[tabela].toArray()
    return todos.filter((item) => !item.deletedAt)
  }

  return await db[tabela]
    .where('syncStatus')
    .equals('pending')
    .toArray()
}

export const pushSync = async ({ forcarTudo = false } = {}) => {
  const config = verificarConfiguracaoSync()

  if (!config.ok) {
    return {
      sucesso: false,
      etapa: 'push',
      erro: config.erro,
      tabelas: []
    }
  }

  const resultado = {
    sucesso: true,
    etapa: 'push',
    modo: forcarTudo ? 'forcado' : 'pendentes',
    tabelas: []
  }

  for (const tabela of TABELAS) {
    const registros = await obterRegistrosParaPush(tabela, forcarTudo)

    const infoTabela = {
      tabela,
      encontrados: registros.length,
      enviados: 0,
      erro: null
    }

    if (registros.length === 0) {
      resultado.tabelas.push(infoTabela)
      continue
    }

    try {
      const resposta = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify({
          secret: API_SECRET,
          tabela,
          registros
        })
      })

      const dados = await lerRespostaJson(resposta)

      if (!resposta.ok || dados.erro) {
        throw new Error(dados.erro || `Erro HTTP ${resposta.status}`)
      }

      if (dados.sucesso) {
        for (const item of registros) {
          await db[tabela]
            .where('uuid')
            .equals(item.uuid)
            .modify({
              syncStatus: 'synced'
            })
        }

        infoTabela.enviados = registros.length
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
  const config = verificarConfiguracaoSync()

  if (!config.ok) {
    return {
      sucesso: false,
      etapa: 'pull',
      erro: config.erro,
      tabelas: []
    }
  }

  const resultado = {
    sucesso: true,
    etapa: 'pull',
    tabelas: []
  }

  for (const tabela of TABELAS) {
    const infoTabela = {
      tabela,
      recebidos: 0,
      novos: 0,
      atualizados: 0,
      conflitos: 0,
      erro: null
    }

    try {
      const url = `${API_URL}?tabela=${encodeURIComponent(tabela)}&secret=${encodeURIComponent(API_SECRET || '')}`

      const resposta = await fetch(url)
      const remotos = await lerRespostaJson(resposta)

      if (!resposta.ok || remotos.erro) {
        throw new Error(remotos.erro || `Erro HTTP ${resposta.status}`)
      }

      if (!Array.isArray(remotos)) {
        throw new Error(`Resposta inesperada no pull da tabela ${tabela}`)
      }

      infoTabela.recebidos = remotos.length

      for (const remoto of remotos) {
        if (!remoto.uuid) continue

        const local = await db[tabela]
          .where('uuid')
          .equals(remoto.uuid)
          .first()

        if (!local) {
          await db[tabela].add({
            ...remoto,
            syncStatus: 'synced'
          })

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

          infoTabela.conflitos++
          continue
        }

        if (!localTemAlteracao && remotoMaisNovo) {
          await db[tabela]
            .where('uuid')
            .equals(remoto.uuid)
            .modify({
              ...remoto,
              syncStatus: 'synced'
            })

          infoTabela.atualizados++
        }
      }
    } catch (err) {
      infoTabela.erro = err.message
      resultado.sucesso = false
      console.error(`Erro no pull da tabela ${tabela}:`, err)
    }

    resultado.tabelas.push(infoTabela)
  }

  return resultado
}

export const executarSync = async ({ forcarTudo = false } = {}) => {
  const config = verificarConfiguracaoSync()

  if (!config.ok) {
    return {
      sucesso: false,
      erro: config.erro,
      push: null,
      pull: null
    }
  }

  const push = await pushSync({ forcarTudo })
  const pull = await pullSync()

  return {
    sucesso: push.sucesso && pull.sucesso,
    push,
    pull
  }
}

export const iniciarAutoSync = () => {
  const config = verificarConfiguracaoSync()

  if (!config.ok) {
    console.warn(`Auto sync ignorado: ${config.erro}`)
    return
  }

  window.addEventListener('online', () => executarSync())

  setInterval(() => {
    if (navigator.onLine) {
      executarSync()
    }
  }, 1000 * 60 * 5)
}