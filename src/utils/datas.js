export function normalizarDataCivil(valor) {
  if (!valor) return ''

  const texto = String(valor).trim()

  if (!texto) return ''

  if (texto.includes('T')) {
    return texto.slice(0, 10)
  }

  return texto.slice(0, 10)
}

export function hojeCivil() {
  return new Date().toISOString().slice(0, 10)
}

export function ontemCivil() {
  const data = new Date()
  data.setDate(data.getDate() - 1)

  return data.toISOString().slice(0, 10)
}

export function formatarDataGrupo(dataISO) {
  const dataNormalizada = normalizarDataCivil(dataISO)

  if (!dataNormalizada) return 'Sem data'

  if (dataNormalizada === hojeCivil()) return 'Hoje'
  if (dataNormalizada === ontemCivil()) return 'Ontem'

  const [, mes, dia] = dataNormalizada.split('-')

  return `${dia}/${mes}`
}