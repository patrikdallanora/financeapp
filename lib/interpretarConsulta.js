import { calcularConsulta, normalizarTexto } from './assistenteFinanceiro.js'

const meses = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const padrao = mes => ({ meses: [mes], tipo: 'despesa', categorias: [], excluirCategorias: [], descricoes: [], excluirDescricoes: [], grupo: 'todos', agrupamento: 'categorias', ordem: 'valor', beneficiario: null, esclarecimento: null })
const palavras = (texto, termo) => (` ${texto.replace(/[^a-z0-9]+/g, ' ')} `).includes(` ${termo.replace(/[^a-z0-9]+/g, ' ')} `)
const aliases = nome => {
  const n = normalizarTexto(nome)
  return n === 'investimentos' ? [n, 'investimento'] : n === 'refeicao livre' ? [n, 'refeicoes livres'] : [n]
}

// Deliberately bounded grammar. All arithmetic is in calcularConsulta; this parser
// only selects filters from the local catalog and never evaluates user code.
export function interpretarConsulta(pergunta, dados, contexto = null, hoje = new Date()) {
  const texto = normalizarTexto(pergunta).replace(/[?!.,;:]/g, ' ').replace(/\s+/g, ' ').trim()
  const atual = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(hoje)
  const mesAtual = /^\d{4}-\d{2}/.test(atual) ? atual.slice(0, 7) : `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
  const resposta = msg => ({ esclarecimento: msg })
  if (!texto || texto.length > 2000) return resposta('Escreva uma pergunta de até 2.000 caracteres sobre seus lançamentos.')
  if (/\b(apague|apagar|excluir do banco|altere|alterar|cadastre|cadastrar|pague|pagar|transferir|transfira)\b/.test(texto)) return resposta('Este assistente apenas consulta. Use as telas de lançamentos para alterar seus dados.')
  if (/\b(saldo bancario|previsao|prever|juros|vencimento|vencem|venceu|vencidos|efetivamente pago|fluxo de caixa|data da compra)\b/.test(texto)) return resposta('Posso consultar por mês da fatura ou competência, categoria, descrição e tipo de gasto. Não calculo vencimentos por dia, saldo bancário ou previsões.')
  if (/\b(ontem|hoje|semana|dia|diario|pagos|pagas|pendentes|quitados)\b/.test(texto)) return resposta('A consulta considera o mês inteiro, incluindo pagos e pendentes. Pergunte por mês, categoria ou tipo de gasto; ainda não há filtro por dia ou situação de pagamento.')
  if (new Set(texto.match(/\b20\d{2}\b/g) || []).size > 1) return resposta('Para comparar meses de anos diferentes, faça uma consulta separada para cada ano.')
  const continuação = /\b(desses|destes|dessas|destas|disso|deste total|desse total|agora|detalhe|detalhar|separe|separar|divida|retire|exclua|sem|desconsiderando|excluindo|parceladas|parcelados|avulsos|fixos)\b/.test(texto)
  if (!contexto && /\b(desses|destes|dessas|destas|disso|desse total|deste total|excluidas)\b/.test(texto)) return resposta('Primeiro consulte um mês, por exemplo: Quanto gastei em outubro sem carro, casa e investimentos?')
  let p = contexto && continuação ? structuredClone(contexto) : padrao(mesAtual)
  const ano = texto.match(/\b(20\d{2})\b/)?.[1] || mesAtual.slice(0, 4)
  const explicitos = [...texto.matchAll(/\b(20\d{2})-(0[1-9]|1[0-2])\b/g)].map(m => m[0])
  const encontrados = meses.flatMap((m, i) => palavras(texto, m) ? [`${ano}-${String(i + 1).padStart(2, '0')}`] : [])
  if (explicitos.length || encontrados.length) p.meses = [...new Set(explicitos.length ? explicitos : encontrados)]
  else if (/\b(mes passado|mes anterior)\b/.test(texto)) {
    const [a, m] = mesAtual.split('-').map(Number)
    p.meses = [`${m === 1 ? a - 1 : a}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`]
  } else if (/\b(este mes|neste mes|mes atual|mes corrente)\b/.test(texto)) p.meses = [mesAtual]
  if (/\b(receita|receitas|recebi|entradas)\b/.test(texto)) p.tipo = 'receita'
  else if (/\b(despesa|despesas|gastei|gastos|gasto|compras)\b/.test(texto)) p.tipo = 'despesa'
  const categorias = [...new Set(dados.map(r => r.categoria))]
  const descricoes = [...new Set(dados.map(r => r.descricao))]
  const exclusao = texto.search(/\b(sem|desconsiderando|excluindo|exceto|retire|retirar|tirando|exclua|excluir)\b/)
  const parteExclusao = exclusao >= 0 ? texto.slice(exclusao) : ''
  const parteInclusao = exclusao >= 0 ? texto.slice(0, exclusao) : texto
  // Descriptions take priority over category words inside them: Aluguel carro
  // must not exclude the entire Carro category when it is the requested item.
  const ehCategoria = d => categorias.some(c => aliases(c).includes(normalizarTexto(d)))
  const desExcluir = descricoes.filter(d => !ehCategoria(d) && palavras(parteExclusao, normalizarTexto(d)))
  let textoCategoriasExcluir = parteExclusao
  for (const d of desExcluir) textoCategoriasExcluir = textoCategoriasExcluir.replaceAll(normalizarTexto(d), ' ')
  const catExcluir = categorias.filter(c => aliases(c).some(n => palavras(textoCategoriasExcluir, n)))
  if (exclusao >= 0 && !desExcluir.length && !catExcluir.length) return resposta('Não encontrei o nome que você quer excluir. Use a categoria ou descrição como aparece no extrato.')
  if (catExcluir.length) { p.excluirCategorias = [...new Set([...p.excluirCategorias, ...catExcluir])]; p.categorias = p.categorias.filter(c => !catExcluir.includes(c)) }
  if (desExcluir.length) p.excluirDescricoes = [...new Set([...p.excluirDescricoes, ...desExcluir])]
  let desIncluir = descricoes.filter(d => !ehCategoria(d) && palavras(parteInclusao, normalizarTexto(d)))
  let textoCategoriasIncluir = parteInclusao
  for (const d of desIncluir) textoCategoriasIncluir = textoCategoriasIncluir.replaceAll(normalizarTexto(d), ' ')
  const catIncluir = categorias.filter(c => aliases(c).some(n => palavras(textoCategoriasIncluir, n)))
  if (/\b(categorias excluidas|tres categorias excluidas)\b/.test(texto) && contexto?.excluirCategorias.length) {
    p = { ...p, categorias: [...contexto.excluirCategorias], excluirCategorias: [], descricoes: [], excluirDescricoes: [], grupo: 'todos' }
  } else {
    if (catIncluir.length) { p.categorias = catIncluir; p.excluirCategorias = p.excluirCategorias.filter(c => !catIncluir.includes(c)) }
    if (desIncluir.length) { p.descricoes = desIncluir; p.excluirDescricoes = p.excluirDescricoes.filter(d => !desIncluir.includes(d)) }
  }
  const tipos = [(/\b(parcelada|parceladas|parcelado|parcelados|parcelamento|parcelamentos|parcelas)\b/.test(texto) ? 'parcelados' : null),
    (/\b(fixo|fixos|fixas|recorrente|recorrentes|recorrencias)\b/.test(texto) && !/\b(nao fixos|nao recorrentes)\b/.test(texto) ? 'fixos' : null),
    (/\b(avulso|avulsos|avulsas|nao fixos|nao recorrentes)\b/.test(texto) ? 'avulsos' : null)].filter(Boolean)
  if (tipos.length > 1 || /\b(por tipo|em tipos)\b/.test(texto)) { p.grupo = 'todos'; p.agrupamento = 'tipo' }
  else if (tipos.length === 1) { p.grupo = tipos[0]; p.agrupamento = tipos[0] === 'parcelados' ? 'parcelas' : 'descricao' }
  else if (/\b(detalhe|detalhar|liste|listar|quais|compras|lancamentos)\b/.test(texto) || desIncluir.length) p.agrupamento = 'descricao'
  else p.agrupamento = 'categorias'
  if (/\b(todos os tipos|todas as despesas|todos os gastos)\b/.test(texto)) p.grupo = 'todos'
  if (/\b(por categoria|por categorias)\b/.test(texto)) p.agrupamento = 'categorias'
  p.ordem = 'valor'
  if (/\b(terminam|terminar|termino|perto de vencer|faltam|restantes)\b/.test(texto)) {
    p.grupo = 'parcelados'; p.agrupamento = 'parcelas'; p.ordem = 'termino'
  }
  const beneficiarios = [...new Set(dados.map(r => r.beneficiario).filter(Boolean))]
  const pessoa = beneficiarios.find(b => palavras(texto, `beneficiario ${normalizarTexto(b)}`) || palavras(texto, `pessoa ${normalizarTexto(b)}`))
  if (pessoa) p.beneficiario = pessoa
  if (/\b(todas as pessoas|todos os beneficiarios)\b/.test(texto)) p.beneficiario = null
  const reconhecida = /\b(quanto|total|gastei|gasto|gastos|despesa|despesas|receita|receitas|recebi|compare|comparar|detalhe|detalhar|liste|listar|separe|separar|divida|parceladas|parcelados|avulsos|fixos|retire|exclua|sem)\b/.test(texto)
  if (!reconhecida) return resposta('Não entendi a consulta. Tente: Quanto gastei em outubro?; Detalhe Saúde; Separe em parceladas, fixos e avulsos; ou Detalhe as parceladas que terminam primeiro.')
  return { plano: p }
}

export function responderConsulta(pergunta, dados, contexto, hoje) {
  const interpretacao = interpretarConsulta(pergunta, dados, contexto, hoje)
  if (interpretacao.esclarecimento) return interpretacao
  return { ...interpretacao, resultado: calcularConsulta(dados, interpretacao.plano), consultadoEm: new Date().toISOString() }
}
