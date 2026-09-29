// FINANCEAPP_SYNC_V2: managed synchronization functions, credentials remain in the existing project.
var financeSpreadsheet

function getSheet(nome) {
  if (nome !== META_SHEET && TABELAS.indexOf(nome) === -1) throw new Error('Tabela inválida')
  if (!financeSpreadsheet) financeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet()
  if (!financeSpreadsheet) throw new Error('Planilha do projeto não encontrada')
  return financeSpreadsheet.getSheetByName(nome) || financeSpreadsheet.insertSheet(nome)
}

function dataSync(valor) {
  if (!valor) return 0
  var n = new Date(valor).getTime()
  return isFinite(n) ? n : 0
}

function lerTabelaIncremental(tabela, updatedAfter) {
  var sheet = getSheet(tabela)
  var values = sheet.getDataRange().getValues()
  if (values.length < 2) return []
  var headers = values[0].map(String)
  var limite = dataSync(updatedAfter)
  return values.slice(1).map(function(row) {
    var obj = {}
    headers.forEach(function(header, index) {
      if (header) obj[header] = row[index] instanceof Date ? row[index].toISOString() : row[index]
    })
    return obj
  }).filter(function(obj) {
    return !limite || !dataSync(obj.updatedAt) || dataSync(obj.updatedAt) > limite
  })
}

// Pure planning: no sheet mutation before UUIDs and versions have been validated.
function planejarLote(headers, existentes, registros) {
  var uuidIndex = headers.indexOf('uuid')
  var updatedIndex = headers.indexOf('updatedAt')
  var porUuid = new Map()
  existentes.forEach(function(row, index) {
    var uuid = String(row[uuidIndex] || '')
    if (!uuid) return
    var lista = porUuid.get(uuid) || []
    lista.push(index)
    porUuid.set(uuid, lista)
  })
  var vistos = new Set(), alteracoes = [], novos = [], ignorados = []
  registros.forEach(function(registro) {
    var uuid = String(registro.uuid || '')
    if (!uuid || vistos.has(uuid)) throw new Error('UUID ausente ou repetido no envio')
    vistos.add(uuid)
    var indices = porUuid.get(uuid) || []
    if (indices.length > 1) throw new Error('UUID duplicado na planilha: ' + uuid)
    var anterior = indices.length ? existentes[indices[0]] : null
    if (anterior && dataSync(anterior[updatedIndex]) > dataSync(registro.updatedAt)) {
      ignorados.push(uuid)
      return
    }
    var linha = headers.map(function(h, i) {
      if (!Object.prototype.hasOwnProperty.call(registro, h)) return anterior && anterior[i] !== undefined ? anterior[i] : ''
      var v = registro[h]
      if (v === null || v === undefined) return ''
      return typeof v === 'object' ? JSON.stringify(v) : v
    })
    if (anterior) alteracoes.push({ linha: indices[0] + 2, valores: linha })
    else novos.push(linha)
  })
  return { alteracoes: alteracoes.sort(function(a,b){return a.linha-b.linha}), novos: novos, ignorados: ignorados }
}

function gravarGrupos(sheet, alteracoes, largura) {
  var inicio = 0
  while (inicio < alteracoes.length) {
    var fim = inicio + 1
    while (fim < alteracoes.length && alteracoes[fim].linha === alteracoes[fim-1].linha + 1) fim++
    sheet.getRange(alteracoes[inicio].linha, 1, fim-inicio, largura)
      .setValues(alteracoes.slice(inicio, fim).map(function(a){return a.valores}))
    inicio = fim
  }
}

function doPost(e) {
  var lock
  try {
    var body = JSON.parse(e.postData.contents)
    if (body.secret !== SECRET) return json({erro:'unauthorized'})
    if (body.modo !== 'savePushSubscription' && TABELAS.indexOf(body.tabela) === -1) return json({erro:'Tabela inválida'})
    lock = LockService.getScriptLock()
    if (!lock.tryLock(10000)) return json({erro:'Servidor ocupado. Tente novamente.', retryable:true})
    if (body.modo === 'savePushSubscription') return salvarPushSubscription(body)
    var registros = body.registros
    if (!Array.isArray(registros)) return json({erro:'Registros inválidos'})
    if (!registros.length) return json({sucesso:true,tabela:body.tabela,quantidade:0,versaoSync:2})
    var sheet = getSheet(body.tabela)
    var headers = getHeaders(sheet)
    var novosHeaders = Array.from(new Set(headers.concat(registros.reduce(function(a,r){return a.concat(Object.keys(r))},[]))))
    if (novosHeaders.indexOf('uuid') === -1) return json({erro:'UUID obrigatório'})
    var existentes = sheet.getLastRow() > 1 ? sheet.getRange(2,1,sheet.getLastRow()-1,Math.max(headers.length,1)).getValues() : []
    var plano = planejarLote(novosHeaders, existentes, registros)
    if (novosHeaders.length !== headers.length) sheet.getRange(1,1,1,novosHeaders.length).setValues([novosHeaders])
    gravarGrupos(sheet, plano.alteracoes, novosHeaders.length)
    if (plano.novos.length) sheet.getRange(Math.max(sheet.getLastRow()+1,2),1,plano.novos.length,novosHeaders.length).setValues(plano.novos)
    if (plano.alteracoes.length || plano.novos.length) atualizarMeta(body.tabela)
    SpreadsheetApp.flush()
    return json({sucesso:true,tabela:body.tabela,quantidade:plano.alteracoes.length+plano.novos.length,
      ignorados:plano.ignorados,versaoSync:2})
  } catch(err) {
    return json({erro:String(err),retryable:true})
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock()
  }
}
