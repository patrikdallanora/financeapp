# Preservação antes da migração para Supabase

Esta versão pausa a interface financeira, a API de sincronização e os envios de push para capturar as diferenças dos dois iPhones. Não altera o schema nem limpa o FinanceAppDB. O arquivo `lib/migrationMode.js` contém o bloqueio temporário explícito; não desativá-lo até reconciliar os aparelhos.

## Nos iPhones

1. Manter o app instalado e os dados do Safari. Usar o mesmo ícone e endereço já utilizados.
2. Fechar o app pelo seletor de aplicativos e reabrir com conexão após a publicação desta versão. Se a tela ainda for o Dashboard antigo, não editar nem usar restauração; aguardar a atualização. Não instalar um segundo PWA nem trocar o domínio para obter a atualização.
3. Ao ver `FinanceApp · Preservação 2`, entrar normalmente e aguardar a correção automática das categorias. A versão salva uma cópia anterior, consulta somente o catálogo remoto e aplica os vínculos em transação local. Selecionar iPhone 15 Pro ou iPhone 16 Pro para exportar.
4. Escolher Salvar em Arquivos na folha de compartilhamento. Usar uma pasta privada e confirmar a existência do JSON no app Arquivos.
5. Tocar em Preparar cópia atual, depois Salvar cópia atual. Se o compartilhamento não estiver disponível, usar o download.
6. Enviar os dois JSONs de cada aparelho na conversa da migração. A confirmação real depende de verificar os hashes e importar em banco isolado; o app não marca um download solicitado como arquivo recebido.

Se aparecer zero lançamentos onde havia dados, parar e conferir a origem/ícone antes de continuar. Não limpar, reinstalar ou restaurar. Se o backup falhar, a sincronização continua pausada e os dados originais ficam intactos.

## Correção das categorias

A versão 2 recupera categorias ausentes por UUID, preserva os IDs das linhas existentes e recompõe categoriaId/subcategoriaId dos lançamentos. Não apaga categorias ou lançamentos e não altera valores, baixas, datas de pagamento, exclusões ou recorrências. Subcategorias legadas podem ter o pai recomposto quando todos os lançamentos do mesmo UUID apontam para uma única categoria com o mesmo nome. As escolhas explícitas do usuário são Carro para Lavagem/IPVA e Refeição Livre para o único lançamento Água/Casal/Outros identificado; múltiplos candidatos a esta última regra bloqueiam a aplicação.

A consulta `/api/category-repair` exige a credencial da integração legada e só faz GET de categorias no upstream; não reabre `/api/sync` nem envia gravações ao Sheets. A credencial legada continua precisando de substituição por Auth/RLS na migração ao Supabase.

Antes de gravar, o app confere se as tabelas continuam iguais ao snapshot. Qualquer edição concorrente aborta a transação. Repetir a correção converge sem duplicar cadastros. Antes e depois ficam arquivados separadamente. Exportação após a correção permite confirmar a execução real no iPhone; publicação não equivale a confirmar que o aparelho reabriu a versão nova.

## Formato e verificação

O envelope JSON contém versão, payload tipado e SHA-256. O snapshot transacional inclui todas as tabelas existentes, IDs, UUIDs, campos desconhecidos, registros excluídos e syncLog. Metadados do localStorage usam allowlist; sessão e credenciais locais são excluídas. As cópias ficam em outro banco IndexedDB, FinanceAppPreservationBackups, sem expiração automática nesta etapa. Isso não protege contra limpar os dados do site: a exportação externa continua obrigatória.

O teste de restauração usa um banco isolado, vazio e com schema compatível. Nunca substitui a origem nem mescla por nome, timestamp ou maior valor pago. Duplicações são preservadas para reconciliação posterior.

Após receber os arquivos, executar `node tools/verify-device-backup.mjs ARQUIVO.json` para verificar SHA-256 e reconstrução integral em IndexedDB simulado isolado. O comando imprime somente manifesto e contagens. A função `reconcileSnapshots` compara as versões preservando dados exclusivos, duplicações, nomes divergentes e relações por origem; não efetua mescla. Receber o arquivo não autoriza ignorar conflitos.

## Planilha

O backup operacional deve conter cópia nativa no Drive e XLSX em armazenamento privado externo ao repositório, com verificação do ZIP e manifesto de hashes. `python tools/inspect-sheet-backup.py INPUT.xlsx PRIVATE_OUTPUT_DIR` inspeciona o arquivo sem alterá-lo e produz arquivo privado de células e manifesto, sem imprimir linhas financeiras ou credenciais push.

Não commitar os backups ou credenciais. A exportação inicial é uma fotografia e não substitui o delta final do corte. A pausa do proxy Vercel não bloqueia automaticamente edições diretas no Sheets nem implantações antigas fixas/Apps Script direto; manter todos os usuários sem editar até a captura final.

## Validação

`node --test tests/*.test.js` e `npm run build`. Os testes exercitam restauração em IndexedDB isolado, perda de resposta/arquivo alterado, imutabilidade da cópia inicial, falha de arquivo local e bloqueio de API e push durante preservação. Teste manual de navegador usa somente uma origem local nova, sem dados de produção.
