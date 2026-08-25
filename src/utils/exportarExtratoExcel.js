import XlsxPopulate from 'xlsx-populate'

const CAMINHO_TEMPLATE = '/templates/extrato-financeiro.xlsx'
const LINHA_INICIAL_EXTRATO = 5
const LINHA_INICIAL_CATEGORIAS = 5
const LINHA_FINAL_CATEGORIAS = 104

const formatarDataExcel = (dataISO) => {
  if (!dataISO) return ''

  const texto = String(dataISO).slice(0, 10)
  const partes = texto.split('-')

  if (partes.length !== 3) return texto

  const [ano, mes, dia] = partes

  return `${dia}/${mes}/${ano}`
}

const formatarParcela = (lancamento) => {
  if (
    lancamento.parcelaAtual &&
    lancamento.totalParcelas
  ) {
    return `${lancamento.parcelaAtual}/${lancamento.totalParcelas}`
  }

  if (lancamento.recorrente) {
    return 'Fixa mensal'
  }

  return '—'
}

const formatarMetodoPagamentoExcel = (metodo) => {
  const mapa = {
    pix: 'PIX',
    dinheiro: 'Dinheiro',
    cartao: 'Cartão'
  }

  return mapa[metodo] || metodo || ''
}

const formatarSituacaoLancamento = (lancamento) => {
  if (lancamento.metodoPagamento === 'cartao') {
    if (lancamento.faturaFechada) {
      return 'Pago'
    }

    return lancamento.status === 'pago'
      ? 'Pago'
      : 'Pendente'
  }

  return lancamento.status === 'pago'
    ? 'Pago'
    : 'Pendente'
}

const formatarSituacaoFatura = (fatura) => {
  if (fatura.fechada) return 'Fechada'
  if (fatura.vencida) return 'Vencida'
  if (Number(fatura.valorPago || 0) > 0) return 'Parcial'

  return 'Aberta'
}

const formatarFatura = (faturaRef) => {
  if (!faturaRef) return 'Fatura'

  const [ano, mes] = String(faturaRef).split('-').map(Number)

  if (!ano || !mes) return String(faturaRef)

  const data = new Date(ano, mes - 1, 1)

  const nomeMes = data.toLocaleDateString('pt-BR', {
    month: 'short'
  })

  const mesFormatado =
    nomeMes.charAt(0).toUpperCase() +
    nomeMes.slice(1).replace('.', '')

  return `${mesFormatado}/${String(ano).slice(-2)}`
}

const montarLinhasExportacao = (timelineExtrato) => {
  const linhas = []

  for (const [, itens] of timelineExtrato) {
    for (const item of itens) {
      if (item.tipo === 'fatura') {
        const fatura = item.fatura

        linhas.push({
          data: formatarDataExcel(item.data),
          item: `Fatura ${fatura.cartao?.nome || 'Cartão'} — ${formatarFatura(fatura.faturaRef)}`,
          categoria: '',
          subcategoria: '',
          parcela: '',
          beneficiario: '',
          metodoPagamento: 'Cartão',
          valor: null,
          situacao: formatarSituacaoFatura(fatura),
          tipoLinha: 'Fatura',
          tipoMovimento: ''
        })

        for (const lancamento of fatura.itens) {
          linhas.push({
            data: '',
            item: `↳ ${lancamento.descricao || ''}`,
            categoria: lancamento.categoria?.nome || '',
            subcategoria: lancamento.subcategoria?.nome || '',
            parcela: formatarParcela(lancamento),
            beneficiario: lancamento.beneficiario || '',
            metodoPagamento: formatarMetodoPagamentoExcel(
              lancamento.metodoPagamento
            ),
            valor: Number(lancamento.valor || 0),
            situacao: '',
            tipoLinha: 'Lançamento',
            tipoMovimento: lancamento.tipo || ''
          })
        }

        continue
      }

      const lancamento = item.lancamento

      linhas.push({
        data: formatarDataExcel(item.data),
        item: lancamento.descricao || '',
        categoria: lancamento.categoria?.nome || '',
        subcategoria: lancamento.subcategoria?.nome || '',
        parcela: formatarParcela(lancamento),
        beneficiario: lancamento.beneficiario || '',
        metodoPagamento: formatarMetodoPagamentoExcel(
          lancamento.metodoPagamento
        ),
        valor: Number(lancamento.valor || 0),
        situacao: formatarSituacaoLancamento(lancamento),
        tipoLinha: 'Lançamento',
        tipoMovimento: lancamento.tipo || ''
      })
    }
  }

  return linhas
}

const obterCategoriasDisponiveis = (categorias) => {
  return [...categorias]
    .filter((categoria) => !categoria.deletedAt)
    .filter((categoria) => {
      return categoria.tipo === 'despesa' || categoria.tipo === 'ambos'
    })
    .sort((a, b) => {
      return String(a.nome || '').localeCompare(
        String(b.nome || ''),
        'pt-BR'
      )
    })
}

const limparExtrato = (planilha) => {
  planilha
    .range(`A${LINHA_INICIAL_EXTRATO}:K2004`)
    .clear({
      contentsOnly: true
    })
}

const preencherExtrato = (planilha, linhas) => {
  if (linhas.length === 0) return

  const valores = linhas.map((linha) => [
    linha.data,
    linha.item,
    linha.categoria,
    linha.subcategoria,
    linha.parcela,
    linha.beneficiario,
    linha.metodoPagamento,
    linha.valor,
    linha.situacao,
    linha.tipoLinha,
    linha.tipoMovimento
  ])

  const linhaFinal =
    LINHA_INICIAL_EXTRATO + valores.length - 1

  planilha
    .range(
      `A${LINHA_INICIAL_EXTRATO}:K${linhaFinal}`
    )
    .value(valores)

  planilha
    .range(
      `H${LINHA_INICIAL_EXTRATO}:H${linhaFinal}`
    )
    .style('numberFormat', 'R$ #,##0.00')

  linhas.forEach((linha, indice) => {
    const numeroLinha =
      LINHA_INICIAL_EXTRATO + indice

    if (linha.tipoLinha === 'Fatura') {
      planilha
        .range(`A${numeroLinha}:K${numeroLinha}`)
        .style({
          bold: true,
          fill: 'E2E8F0'
        })
    }
  })
}

const preencherCategorias = (
  planilha,
  categorias
) => {
  planilha
    .range(
      `A${LINHA_INICIAL_CATEGORIAS}:A${LINHA_FINAL_CATEGORIAS}`
    )
    .clear({
      contentsOnly: true
    })

  const categoriasDisponiveis =
    obterCategoriasDisponiveis(categorias)

  const limite =
    LINHA_FINAL_CATEGORIAS -
    LINHA_INICIAL_CATEGORIAS +
    1

  const categoriasLimitadas =
    categoriasDisponiveis.slice(0, limite)

  categoriasLimitadas.forEach(
    (categoria, indice) => {
      const linha =
        LINHA_INICIAL_CATEGORIAS + indice

      planilha
        .cell(`A${linha}`)
        .value(categoria.nome || '')
    }
  )
}

const montarDescricaoFiltros = ({
  mesAtual,
  filtroTipo,
  filtroPagamento,
  filtroStatus,
  filtroCategoriaId,
  filtroSubcategoriaId,
  filtroUsuarioId,
  filtroCartaoId,
  busca,
  categorias,
  subcategorias,
  cartoes
}) => {
  const partes = []

  if (mesAtual) {
    partes.push(`Período: ${mesAtual}`)
  }

  if (filtroTipo !== 'todos') {
    partes.push(
      filtroTipo === 'receita'
        ? 'Tipo: Receitas'
        : 'Tipo: Despesas'
    )
  }

  if (filtroPagamento !== 'todos') {
    partes.push(
      `Pagamento: ${formatarMetodoPagamentoExcel(
        filtroPagamento
      )}`
    )
  }

  if (filtroStatus !== 'todos') {
    partes.push(
      filtroStatus === 'pago'
        ? 'Status: Pago'
        : 'Status: Pendente'
    )
  }

  if (filtroCategoriaId !== 'todos') {
    const categoria =
      categorias.find(
        (item) =>
          Number(item.id) ===
          Number(filtroCategoriaId)
      )

    if (categoria) {
      partes.push(
        `Categoria: ${categoria.nome}`
      )
    }
  }

  if (filtroSubcategoriaId !== 'todos') {
    const subcategoria =
      subcategorias.find(
        (item) =>
          Number(item.id) ===
          Number(filtroSubcategoriaId)
      )

    if (subcategoria) {
      partes.push(
        `Subcategoria: ${subcategoria.nome}`
      )
    }
  }

  if (filtroUsuarioId !== 'todos') {
    const mapaUsuarios = {
      1: 'PK',
      2: 'Grazi'
    }

    partes.push(
      `Quem lançou: ${
        mapaUsuarios[filtroUsuarioId] ||
        filtroUsuarioId
      }`
    )
  }

  if (filtroCartaoId !== 'todos') {
    const cartao =
      cartoes.find(
        (item) =>
          Number(item.id) ===
          Number(filtroCartaoId)
      )

    if (cartao) {
      partes.push(
        `Cartão: ${cartao.nome}`
      )
    }
  }

  if (busca?.trim()) {
    partes.push(
      `Busca: ${busca.trim()}`
    )
  }

  return partes.length > 0
    ? partes.join(' • ')
    : 'Sem filtros adicionais'
}

const baixarArquivo = (
  blob,
  nomeArquivo
) => {
  const url =
    window.URL.createObjectURL(blob)

  const link =
    document.createElement('a')

  link.href = url
  link.download = nomeArquivo

  document.body.appendChild(link)

  link.click()

  document.body.removeChild(link)

  window.URL.revokeObjectURL(url)
}

export async function exportarExtratoExcel({
  timelineExtrato,
  categorias,
  subcategorias,
  cartoes,
  filtros
}) {
  if (
    !Array.isArray(timelineExtrato) ||
    timelineExtrato.length === 0
  ) {
    throw new Error(
      'Não há lançamentos para exportar com os filtros atuais.'
    )
  }

  const resposta = await fetch(
    CAMINHO_TEMPLATE
  )

  if (!resposta.ok) {
    throw new Error(
      'Não foi possível carregar o template do Excel.'
    )
  }

  const arquivoTemplate =
    await resposta.arrayBuffer()

  const workbook =
    await XlsxPopulate.fromDataAsync(
      arquivoTemplate
    )

  const planilhaExtrato =
    workbook.sheet('Extrato')

  const planilhaCategorias =
    workbook.sheet(
      'Gastos por categoria'
    )

  if (
    !planilhaExtrato ||
    !planilhaCategorias
  ) {
    throw new Error(
      'O template do Excel está inválido.'
    )
  }

  const linhas =
    montarLinhasExportacao(
      timelineExtrato
    )

  limparExtrato(planilhaExtrato)

  preencherExtrato(
    planilhaExtrato,
    linhas
  )

  preencherCategorias(
    planilhaCategorias,
    categorias
  )

  const descricaoFiltros =
    montarDescricaoFiltros({
      ...filtros,
      categorias,
      subcategorias,
      cartoes
    })

  planilhaExtrato
    .cell('A2')
    .value(
      `Filtros aplicados: ${descricaoFiltros}`
    )

  const blob =
    await workbook.outputAsync()

  const mesArquivo =
    String(
      filtros.mesAtual || 'periodo'
    ).replace(/[^0-9-]/g, '')

  baixarArquivo(
    blob,
    `extrato-financeiro-${mesArquivo}.xlsx`
  )
}