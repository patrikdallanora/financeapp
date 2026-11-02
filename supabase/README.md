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

Os dois iPhones originais confirmaram o mesmo snapshot em 02/11/2026. As telas usam FinanceAppSupabaseDB por uma fachada que grava ação e fila atomicamente. A sessão da conferência é reaproveitada. A ativação inicial exige internet, autorização da base e cópia inicial verificada; depois há uso offline. O banco antigo permanece intacto. MIGRATION_CAPTURE_MODE=false prepara a interface normal; a trava de servidor sync_enabled só deve ser habilitada após verificar a publicação. LEGACY_BACKEND_DISABLED=true mantém os endpoints Sheets encerrados.

O gerenciador reenvia IDs estáveis, pagina o pull e retoma ao abrir ou reconectar. Conflitos mostram a versão atual e a intenção local, usam novo ID ao reaplicar e preservam edições posteriores sem ressuscitar valores descartados. Alertas usam somente dados canônicos e inscrições privadas autenticadas. O cron exige CRON_SECRET e registra uma tentativa por aparelho/dia antes de enviar; falhas incertas não são reenviadas automaticamente. Não é garantia de entrega do push. Saída da conta é local ao aparelho e desativa sua inscrição.

Na virada: verificar 2/2 confirmações do snapshot, hash e contagens; ensaiar mutação/replay/conflito em transação descartada; executar testes/build; publicar e comparar hash do bundle; testar endpoints legados e cron; somente então habilitar sync_enabled. A validação de uso real da versão nova exige reabrir o ícone nos dois iPhones.

Rollback: primeiro pausar sync_enabled. Antes de mudar código ou restaurar qualquer base, exportar financeapp_records com revisões, change_log, mutation_receipts, identity_aliases e backups locais completos dos dois aparelhos, incluindo outbox. Preservar os arquivos originais e criar hashes. Nunca voltar ao snapshot inicial sobre novas escritas. Reaplicar o delta com recibos/UUIDs ou corrigir a versão mantendo a base nova; não reativar o escritor Sheets em paralelo. A cópia inicial local é imutável e o menu permite exportar novas cópias sem sobrescrever a inicial. Dados remotos originais também são imutáveis.

Variáveis administrativas SUPABASE_URL, SUPABASE_SECRET_KEY e CRON_SECRET existem somente no servidor da Vercel, em produção; não usar prefixo VITE_. Conferência do SDK administrativo e RPC privado foi feita sem enviar notificações. O aviso de RLS sem políticas nas tabelas privadas é intencional; a proteção adicional de senhas comprometidas não está ativada no plano atual.

## Histórico e ferramentas

Os arquivos de migrations usam as versões realmente aplicadas no remoto. Não reaplicar a migração inicial com outro timestamp.

prepare-remote-preservation.mjs e verify-preservation-transport.mjs documentam o transporte antigo. **Não usá-los para alterar envelopes remotos:** concatenações foram rejeitadas e agora as evidências estão congeladas.

Usar prepare-immutable-archive.mjs e verify-immutable-archive.mjs para transporte insert-only. build-consolidated-candidate.mjs exige decisões explícitas; verify-canonical-candidate.mjs ensaia importação/repetição; prepare-canonical-import.mjs prepara lotes privados; verify-cloud-local-copy.mjs confere ida e volta entre valores canônicos e IDs locais.

Diretórios gerados são privados e nunca entram no Git. Testes usam dados sintéticos. Variáveis Vercel de produção/preview recebem somente URL e chave publicável do Supabase; não registrar credenciais ou .env.local no Git ou nas memórias.
