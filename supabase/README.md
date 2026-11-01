# Supabase do FinanceApp

A primeira migração cria somente a área privada de preservação/reconciliação, a base familiar e seus membros. A sincronização nasce desabilitada. Não existe importação automática ou troca do backend nesta etapa.

Aplicar em projeto Supabase dedicado após conexão administrativa autorizada. Membros usam auth.users; as pessoas financeiras do app continuam entidades separadas. Não colocar service_role no Vite ou conceder leitura do staging aos clientes. A área privada preserva duplicados e origens, com integridade referencial por base e execução da migração.

Testes SQL executam em PGlite isolado com auth/roles simulados e verificam RLS, negativa de escrita por clientes, duplicação de importação e preservação de UUID repetido. A configuração real de Auth, roles, esquemas expostos e políticas ainda precisa ser verificada no projeto após provisionamento.

Antes da próxima migração de domínio, reconciliar os snapshots dos dois iPhones com o Sheets. Categorias com mesmo UUID e nomes diferentes não devem ser substituídas por timestamp. O schema de domínio e o protocolo transacional de sincronização serão implementados depois dessa captura, sem ativar gravações de clientes até concluir os testes do plano.
