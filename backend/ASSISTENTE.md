# Assistente de consultas local

Menu Assistente na navegação inferior, com campo de pergunta, respostas em tabelas e continuidade de filtros. Sem IA, API, tokens, chave ou custo de provedor. Lê somente um snapshot transacional do Dexie deste aparelho; não altera dados nem transmite a conversa. Funciona offline com dados já salvos. Histórico em memória enquanto a tela está aberta.

## Consultas suportadas

- Quanto gastei em outubro sem carro, casa e investimentos?
- Retire também Aluguel carro.
- Separe em compras parceladas, gastos fixos e avulsos.
- Desses, detalhe os avulsos.
- Detalhe as parceladas que terminam primeiro.
- Quanto foi gasto nas três categorias excluídas?
- Compare setembro e outubro de 2026.
- Detalhe Saúde em 2026-10.
- Filtrar pessoa: use beneficiário PK ou pessoa Grazi; remover: todos os beneficiários.

Interpretador determinístico em lib/interpretarConsulta.js. Não é uma IA geral: datas de vencimento diárias, previsões, saldo bancário e escrita não são suportados. Perguntas não reconhecidas pedem reformulação. Filtros interpretados aparecem junto aos resultados para conferência. Uma pergunta independente começa novo recorte; detalhe/desses/separe/retire/sem mantêm o anterior. Nova conversa limpa o recorte.

## Critérios

Cartão por faturaRef, demais por dataCompetencia; datas ISO, YYYY-MM e seriais Sheets. Exclui apagados e categorias Reembolso/Reembolsos. Todos os beneficiários por padrão; pagos e pendentes. Parcelados: totalParcelas>1; fixos: recorrente=true sem parcelas; avulsos: restantes. Totais calculados em centavos. UUID de categoria prevalece sobre id legado. Itens sem categoria ficam explícitos. Dados inválidos/UUIDs duplicados bloqueiam a consulta em vez de omitir valores. Filtros por igualdade de nomes normalizados; categoria tem prioridade sobre descrição idêntica. Não reclassifica lançamentos pela descrição.

Parcelamentos agrupados por parcelamentoId e mês; ordem de término usa maior parcela lançada no mês, preservando compras distintas. Não equivale a data real de compra nem vencimento diário. Um mês em andamento não é fechamento definitivo. Base local pode diferir da remota enquanto há sincronização pendente.

## Verificação

node --test tests/*.test.js
npm run build

Testes específicos: centavos, datas, filtros, categorias por UUID, duplicados, três grupos exclusivos, parcelas do mesmo parcelamento no mesmo mês, sequência de perguntas com contexto, consultas não suportadas. Nenhuma chamada à OpenAI ou escrita em lançamentos reais é necessária.
