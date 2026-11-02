# Supabase do FinanceApp

## Provisionamento remoto em 2026-11-02

Projeto dedicado `ierhglfrlryooyyxycid`, organização Pk Company, plano Free, região São Paulo (`sa-east-1`); custo de criação informado pelo serviço: US$ 0/mês. A primeira migração local foi aplicada remotamente como `20261102133954_preservation_staging`. A migração remota `20261102134046_preservation_fk_indexes` acrescentou os índices `memberships(user_id)`, `reconciliation_issues(household_id,migration_run_id)` e `source_records(household_id,migration_run_id,source_backup_id)` após a inspeção dos advisors.

Todas as seis tabelas têm RLS. Clientes não têm privilégios no staging; usuário autenticado sem vínculo não enxerga bases familiares. Os avisos informativos de RLS sem políticas nas cinco tabelas privadas são intencionais: acesso administrativo somente. Não adicionar políticas públicas para remover esses avisos.

O backup real de 02/11 do iPhone 15 Pro foi armazenado integralmente: 1.511 registros (incluindo 1.396 lançamentos), hash do arquivo e hash canônico dos registros iguais aos originais. O backup do 16 Pro está **parcial e não validado**, sem registros importados. A revisão automática bloqueou a continuação da cópia em trechos, mesmo após autorização específica do usuário, hashes de prefixos, teste isolado repetido e transações. Não prosseguir com esse transporte sem resolver o bloqueio; não tratar a cópia parcial como backup. Originais privados dos dois aparelhos continuam preservados. Não houve corte do aplicativo ou ativação da sincronização.

`tools/prepare-remote-preservation.mjs` prepara lotes SQL privados, transacionais, idempotentes e protegidos por hashes dos prefixos. O diretório gerado contém dados financeiros e deve ficar fora do Git. `tools/verify-preservation-transport.mjs` executa os lotes duas vezes em PGlite, verifica cada registro e calcula um hash canônico para comparar com o banco remoto. As migrações remotas devem ser reconciliadas com o histórico local antes de usar `db push`; não reaplicar a primeira migração com outro timestamp.

A primeira migração cria somente a área privada de preservação/reconciliação, a base familiar e seus membros. A sincronização nasce desabilitada. Não existe importação automática ou troca do backend nesta etapa.

Aplicar em projeto Supabase dedicado após conexão administrativa autorizada. Membros usam auth.users; as pessoas financeiras do app continuam entidades separadas. Não colocar service_role no Vite ou conceder leitura do staging aos clientes. A área privada preserva duplicados e origens, com integridade referencial por base e execução da migração.

Testes SQL executam em PGlite isolado com auth/roles simulados e verificam RLS, negativa de escrita por clientes, duplicação de importação e preservação de UUID repetido. A configuração real de Auth, roles, esquemas expostos e políticas ainda precisa ser verificada no projeto após provisionamento.

Antes da próxima migração de domínio, reconciliar os snapshots dos dois iPhones com o Sheets. Categorias com mesmo UUID e nomes diferentes não devem ser substituídas por timestamp. O schema de domínio e o protocolo transacional de sincronização serão implementados depois dessa captura, sem ativar gravações de clientes até concluir os testes do plano.
