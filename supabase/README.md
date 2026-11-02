# Supabase do FinanceApp

## Estado em 2 de novembro de 2026

Projeto dedicado `ierhglfrlryooyyxycid`, Pk Company, Free, São Paulo. Custo de criação consultado: US$ 0/mês. Nenhum plano pago ou SMTP externo contratado.

Os backups reais de 02/11 estão completos no banco e fora dele: iPhone 15 Pro, envelope original e 1.511 registros; iPhone 16 Pro, 146 blocos imutáveis e 1.671 registros. Arquivos e hashes canônicos coincidem com os originais. A antiga cópia parcial do 16 Pro ficou congelada para auditoria e não deve ser restaurada.

A cópia independente do Sheets está no XLSX privado e no Drive. A união das três fontes preserva 1.575 lançamentos, incluindo cinco exclusivos do Sheets. O usuário confirmou 34 estados pagos, Água/Casal em refeição, nove unificações de categorias e pessoas em PK/Grazi, reparando 102 referências antigas. UUIDs anteriores estão no mapa privado. Não foram mesclados lançamentos por descrição/valor, nem cartões pelo nome.

Base canônica: 1.679 registros, sendo 2 pessoas, 10 cartões, 20 categorias, 72 subcategorias, 1.575 lançamentos e zero faturas/metas nas tabelas respectivas. Acumulados de fatura permanecem nos lançamentos, sem soma duplicada. Importação isolada repetida, hash remoto e cópia local paginada conferiram cada registro, inclusive excluídos e extras.

## Acesso e protocolo

Todas as tabelas têm RLS. Clientes só leem sua base; staging e evidências são privados. Avisos informativos de RLS sem políticas no schema privado são intencionais: não acrescentar leitura pública para removê-los. Evidências, decisões e mapas aceitos são imutáveis.

Auth é separado das pessoas financeiras. Allowlist privada associa somente e-mail confirmado à base, sem usar user_metadata para autorização. O usuário cria sua senha no app. URLs de Auth foram configuradas para https://pk-finance.vercel.app por diff mínimo no CLI, mantendo o restante. O Free recusou templates personalizados com provedor padrão: foram mantidos os templates padrão, sem contratar SMTP.

financeapp_records guarda sete tipos com payload canônico, UUID, centavos inteiros, datas civis, revisão de servidor e tombstones. Validação de referências pertence à mesma base. Escritas diretas de clientes são negadas; as mutações usam RPC transacional, ID estável, revisão esperada, recibos e conflitos preservados. O lock por base precede a alocação do cursor. Pagamentos de vários itens são atômicos. O pull pagina um histórico persistente e tolera lacunas de revisão sem perder mudanças.

Funções públicas são invoker. As definer ficam privadas, com search_path vazio e verificação de sessão/membro. Nenhuma service_role é enviada ao navegador.

## Cliente e passagem para produção

localOutbox.js implementa alteração e fila na mesma transação Dexie, dependências de recibos e confirmação que preserva edição durante envio. Pulls têm staging separado por leitura/aba; dados e cursor são aplicados juntos, sem sobrescrever pendências. FinanceAppSupabaseDB é separado de FinanceAppDB e não cria seed duplicado.

**A fachada de escrita ainda não está conectada às telas financeiras.** MIGRATION_CAPTURE_MODE continua true; API antiga, cron e sync_enabled permanecem pausados. A Preservação 3 oferece login e conferência somente de leitura. Os dois PWAs originais precisam confirmar o snapshot atual usando seus identificadores já capturados. O banco antigo permanece intacto.

Antes da virada: concluir testes autenticados nos dois iPhones, conectar todas as gravações à fachada e ao novo gerenciador, implementar resolução de conflitos, migrar notificações e cercar caminhos antigos. Só então habilitar o escritor único. Rollback após gravações novas exige preservar e reaplicar o delta.

## Histórico e ferramentas

Os arquivos de migrations usam as versões realmente aplicadas no remoto. Não reaplicar a migração inicial com outro timestamp.

prepare-remote-preservation.mjs e verify-preservation-transport.mjs documentam o transporte antigo. **Não usá-los para alterar envelopes remotos:** concatenações foram rejeitadas e agora as evidências estão congeladas.

Usar prepare-immutable-archive.mjs e verify-immutable-archive.mjs para transporte insert-only. build-consolidated-candidate.mjs exige decisões explícitas; verify-canonical-candidate.mjs ensaia importação/repetição; prepare-canonical-import.mjs prepara lotes privados; verify-cloud-local-copy.mjs confere ida e volta entre valores canônicos e IDs locais.

Diretórios gerados são privados e nunca entram no Git. Testes usam dados sintéticos. Variáveis Vercel de produção/preview recebem somente URL e chave publicável do Supabase; não registrar credenciais ou .env.local no Git ou nas memórias.
