# Implementação e evidências das regras do EventHub

Registro de 10/11/2026. A [matriz de requisitos](../requirements-matrix.md) preserva o diagnóstico anterior às alterações e a origem de cada regra. Este resumo descreve o código presente no workspace e separa resultados executados de verificações ainda pendentes. Não comprova implantação em produção.

## Alterações principais

| Área e arquivos principais | Comportamento implementado | Requisitos relacionados |
| --- | --- | --- |
| Identity: `src/users/repository.js`, `src/organizations/{repository,service}.js`, `src/routes/{organizations,internal}.js`, `src/security/{tokens,sessions}.js` | Cadastro transacional determina um perfil exclusivo; organizador possui uma instituição; conta participante não ganha administração por vínculo. JWT e sessão confrontam perfil/instituição persistidos. A API não altera esses atributos por edição de perfil, segundo vínculo ou manipulação de IDs. | RF01, RN07, P01–P04, RQ07 |
| Gateway: `src/security/{tokens,sessions}.js` | Aceita somente os dois perfis válidos, exige instituição no organizador e verifica a identidade atual no Identity. A seleção visual de área não muda a permissão da conta. | RF01, RN07, P01, P04 |
| Events: `app/domain.py`, `app/announcements.py` | Criação atribui responsável no servidor. Listagem gerenciada, edição, publicação, cancelamento e anúncios exigem simultaneamente perfil organizador, instituição do evento e responsabilidade individual. Colega da mesma instituição não administra eventos alheios. Resposta pública omite responsável operacional e e-mail de palestrante. | RF02–RF04, RN07, P03–P05 |
| Registrations: `app/{domain,main}.py`, `app/migrations/` | Operações pessoais exigem participante. Preserva chave idempotente, espera FIFO e outbox. A proteção persistente serializa mudanças de ocupação; decisões de pagamento contraditórias são rejeitadas. A expiração tem thread própria e usa apenas PostgreSQL, sem chamar Events ou RabbitMQ; promoção de espera/publicação seguem em outra thread. | RF05–RF08, RN01–RN05, P04–P05, RQ03–RQ04 |
| Payments: `src/payments.js`, `src/database/migrations/` | Mantém reconciliação idempotente e distingue resultado do provedor do estado efetivo da reserva. Acrescenta consulta interna de transações em lotes e migração com checksum. | RF07, RF11, RN02–RN03, RQ04–RQ05 |
| Notifications: `app/consumer.py` | Retry e DLQ usam publicação confirmada com `mandatory=true`; a entrega original não é reconhecida quando não existe rota para a nova mensagem. Falha de notificação não reverte inscrição. | RF08, RN05, RQ03 |
| Reporting: `app/domain.py`; `compose.yaml` | Expõe ocupação, reservas vigentes, vagas e anomalia de capacidade, além de transações do Payments por estado. Indisponibilidade ou inconsistência da fonte financeira fica explícita, sem falsos zeros. CSV preserva escopo, campos antigos e proteção de texto. Compose fornece `PAYMENTS_URL`. | RF11, RQ03, RQ05 |
| Attendance e Certificates: `services/{attendance,certificates}/test/test_rules.py` | Testes registram os critérios preexistentes de presença, autorização, conclusão temporal e integridade; não introduzem percentuais de frequência ou controle de saída. | RF09–RF10, RN06 |
| Frontend: `src/auth/{AuthContext,RequireAccount,session,access}`, `src/App.tsx`, layouts e páginas de acesso, instituição, eventos, inscrições e `organization/DashboardPage.tsx` | Rotas e menus seguem o perfil validado no servidor; cache local é revalidado antes de montar páginas protegidas. Área de login divergente não converte perfil. Instituição do organizador é fixa e preview gerenciado não oferece inscrição. Dashboard usa transações/ocupação fornecidas pela API, explica indisponibilidade financeira e mantém fallback para relatório legado. Fluxos mantêm recuperação de erro e estados de carregamento. | RF01–RF05, RF11, P01–P04, P07 |
| Operação: `scripts/{audit-business-data,init-rules-qa,backup-local-verified,trace-registration}.mjs`; preflights e resolvedores de legado | Diagnóstico somente de leitura, QA separado, backup com restauração de clones e rastreamento por correlação. Resolução de legado exige plano explícito revisado e mantém histórico. | P06, P08, RQ06–RQ08 |

Os arquivos de interface e ativos já modificados no workspace foram mantidos. As referências visuais orientam apresentação e navegação; textos ilegíveis nas imagens não foram transformados em regras de negócio.

## Migrações versionadas

Cada serviço aplica apenas migrações do próprio banco, em transação e sob trava consultiva. Os loaders calculam SHA-256 sobre SQL UTF-8 com CRLF normalizado para LF, registram nome/checksum/data e interrompem a inicialização diante de conteúdo divergente. Não se deve editar SQL já aplicado para atualizar uma instalação.

| Banco e registro | Arquivo | Proteção acrescentada |
| --- | --- | --- |
| `identity_db.schema_migrations` | `services/identity/src/database/migrations/007_exclusive_profiles_and_institution.sql` | Preflight impede classificação automática de legado; perfil escalar, `UNIQUE(user_id)` para uma instituição, triggers diferidas de consistência perfil/vínculo e identificadores de vínculo imutáveis. Preserva as migrações `001`–`006`. |
| `event_db.event_schema_migrations` | `services/events/app/migrations/001_event_responsibility.sql` | Responsável obrigatório em coluna/payload, identidade estrutural consistente, índice instituição/responsável e imutabilidade de instituição/responsabilidade. Evento legado ambíguo impede aplicação. |
| `registration_db.schema_migrations` | `services/registrations/app/migrations/001_registration_integrity.sql` | Preflight de capacidade/snapshot/recibo pago; reserva paga válida; decisão por inscrição; transições e identificadores protegidos; capacidade e recibo aprovado exigidos no banco. |
| `registration_db.schema_migrations` | `services/registrations/app/migrations/002_capacity_isolation.sql` | Acrescenta `inventories.revision` e atualiza a revisão em toda gravação protegida. Um lock isolado não invalida snapshot antigo de `REPEATABLE READ`; a escrita na revisão força conflito entre transações concorrentes também nesse isolamento e em `SERIALIZABLE`. O guard rejeita excesso em `READ COMMITTED`. |
| `payment_db.payment_schema_migrations` | `services/payments/src/database/migrations/001_payment_integrity.sql` | Preflight de modo/resultado/expiração; restringe modo do provedor e estados válidos; exige prazo na simulação externa; admite resultado `EXPIRED`. Loader novo registra e confere checksum. |

Checksums calculados sobre os arquivos desta revisão local, com a mesma normalização dos loaders:

```text
identity/007_exclusive_profiles_and_institution.sql  5739581005f012c9b64bc85fe9d0960faefece4735fb93948e2efee6dd86aca3
events/001_event_responsibility.sql                 e9f0fa63eb0f33ef742b7d859b6d9e5385ed95c90fe1ab9d2a8bf9246c76521c
registrations/001_registration_integrity.sql        8c52bd42dcf784d621dbaa501ebcd358301ee7bb3a204226ab28c2735c4cfa95
registrations/002_capacity_isolation.sql            b32f562f25c9cdb3cff57ea45207aaf5292ca30b9864e572312c08da09945627
payments/001_payment_integrity.sql                  e26c1024545758c34b939fef6de6d5db4d3c7c7133e540b0f1b933448dab28fa
```

O banco conta conservadoramente toda inscrição `PENDING_PAYMENT` até a expiração ser persistida pelo worker; reservas vencidas não liberam uma vaga por mera leitura do relógio no constraint. A API executa manutenção sob a proteção do inventário e o relatório apresenta o estado efetivo no instante do snapshot. Isso evita superlotação sem tratar consistência eventual como transação distribuída.

A versão final inicia `expiry_worker` e o worker de promoção/outbox como duas threads no lifespan de Registrations. O ciclo de expiração procura reservas vencidas e atualiza estado/outbox sob trava local, sem chamadas HTTP ou ao broker. Assim, sucessivos timeouts de Events ou RabbitMQ não atrasam o próximo ciclo de expiração. A primeira implementação usava duas passagens na mesma thread; ela foi substituída porque uma dependência lenta ainda poderia atrasar o ciclo seguinte. A suíte HTTP final comprovou expiração com Events parado e promoção da espera paga após sua recuperação.

Os preflights e planos de classificação estão detalhados em [perfis e legado](../access-rules.md). Nenhum responsável ou instituição é escolhido por heurística. Conflitos fora dos casos suportados pelos resolvedores exigem plano específico que preserve histórico.

## Contratos, fronteiras e rastreamento

A [documentação de APIs e regras](../api/business-rules.md) descreve estados, erros, critérios de presença/certificado, limites de idempotência e falhas parciais. A [arquitetura por capacidade](../architecture/business-capabilities.md) relaciona proprietários dos dados e o fluxo Identity → Events → Registrations → Payments → Provider → Registrations.

- `GET /events/{id}?managed=true` é o contrato comum de autorização operacional; a chave interna não substitui perfil, instituição e responsabilidade do usuário.
- `POST /internal/registrations/{id}/payment` recebe resultado autenticado internamente; uma aprovação tardia não reativa inscrição expirada/cancelada e uma decisão contraditória é recusada.
- `POST /internal/payments/query` recebe até 500 UUIDs em `registrationIds`, exige chave de serviço e não é publicado pelo gateway. Reporting consulta apenas inscrições do evento autorizado e rejeita transações inesperadas, repetidas ou com preço incompatível.
- Mensagens de versão 1 incluem `id`, `type`, `registrationId`, `userId`, `correlationId` e `requestId`, com deduplicação e outbox. Retry confirmado não constitui promessa de SMTP exatamente uma vez.
- `x-request-id` e `x-correlation-id` acompanham HTTP, snapshot da inscrição, pagamento, outbox e consumidores. `node scripts/trace-registration.mjs UUID --since 30m` lê a inscrição e os logs no projeto Compose selecionado pelo ambiente. O script usa o projeto Compose padrão; QA exige `COMPOSE_PROJECT_NAME=eventhub-rules-qa` e configuração explícita de `COMPOSE_ENV_FILES=tmp/rules-qa/.env`, ou comandos Compose equivalentes. Não imprimir JWT, senhas ou chaves internas para rastrear uma operação.

## Evidências executadas

Resultados comunicados pela validação desta entrega em 10/11/2026:

| Verificação | Resultado registrado | Alcance |
| --- | --- | --- |
| `node --test tests/unit/identity-access.test.mjs` | **6 PASS** | API direta, injeção de perfil/instituição, segundo vínculo, claims assinadas e correspondência da sessão com persistência. |
| Python `unittest` de `tests/unit/test_event_access.py` | **6 PASS** | Responsabilidade, mesma instituição, consulta gerenciada com chave interna, mutações e ocultação de dados operacionais na resposta pública. |
| Suites de domínio Attendance / Certificates / Reporting / Notifications | **5 / 10 / 10 / 2 PASS**, total 27 | Regras isoladas; detalhes em [resultados de domínio](domain-rules-results.md). Dependências simuladas nas fronteiras; não provam concorrência PostgreSQL. |
| `npm --prefix frontend run build` | **PASS**, repetido após o ajuste do dashboard | TypeScript e bundle de produção da versão final do dashboard. |
| `npm --prefix frontend run test:access` | **14 PASS**: 11 de acesso/checkout em aproximadamente **156,9 s** e 3 novos de dashboard aprovados depois | Navegador Chromium com todas as chamadas `/api` interceptadas: perfil, storage adulterado, indisponibilidade de identidade, instituição fixa, preview, gratuita e pagamento aprovado/recusado/expirado. Os 3 casos de dashboard validam transações/ocupação da API, fonte financeira indisponível sem falsos zeros e relatório legado. Não é fluxo HTTP integrado real. |
| `node --test tests/integration/capacity-isolation.mjs` | **5 PASS, 0 FAIL**, saída 0 em aproximadamente **140,8 s** | PostgreSQL real do QA: reproduz duas confirmadas para uma vaga usando somente a migração histórica `001` em `REPEATABLE READ`; com `001` + `002`, preserva uma confirmada/uma vaga sob `READ COMMITTED`, `REPEATABLE READ` e `SERIALIZABLE`. Os schemas temporários da execução final foram descartados. |
| `node --test tests/integration/access-migrations.mjs` | **4 PASS, 0 FAIL**, saída 0 em aproximadamente **30,5 s** | PostgreSQL real do QA: legado com perfil/vínculo ambíguo e evento sem responsável impedem ativação sem alterar histórico; perfil exclusivo, instituição única e vários organizadores por instituição são protegidos no commit. |
| `node --test tests/integration/business-rules.mjs` | **8 PASS, 0 FAIL**, saída 0 em **97,6 s** (`97598.3427 ms`) | Fluxo HTTP e persistência reais no QA: perfis/instituição, responsabilidade e exportação, concorrência/FIFO, pagamento/callback, expiração sem Events, falha de consumidores/broker, presença e certificados. Saída final em `tmp/rules-qa/integration-results.log`. |
| `node --test tests/integration/payment-recovery.mjs` | **3 PASS, 0 FAIL** em aproximadamente **11,57 s** | Aprovação tardia após cancelamento não reativa nem retoma a vaga; provedor parado mantém uma transação pendente e a reconciliação confirma após retorno; callback repetido preserva o estado válido. Usa somente fixtures e serviços QA. |
| `node tests/integration/frontend-live.mjs` | **7 verificações reais aprovadas**, **16 screenshots**, `errors=[]` | Chromium contra `http://127.0.0.1:18080`, sem interceptação das APIs; desktop de 1440 px e mobile de 390 px. Evidência em `output/visual-audit/2026-11-10/live/verification.json`. Essas verificações são adicionais aos testes contabilizados abaixo. |
| `node scripts/backup-local-verified.mjs` | **9/9 bancos restaurados** em clones isolados de QA | Origem exclusivamente no stack local `eventhub`; manifesto em `tmp/rules-backups/20261111005248655/manifest.json`, com SHA-256 de cada dump/papéis e contagem de tabelas restauradas. Não é backup de produção. |
| Auditoria somente de leitura do stack local anterior | Perfis compatíveis e zero eventos, conforme `docs/access-rules.md` | Diagnóstico local anterior às migrações; não representa dados remotos nem valida as novas restrições aplicadas. |

Total de testes unitários/de domínio/de navegador aprovados: **53**. Isolamento de capacidade e migrações acrescentam **9 testes em PostgreSQL QA**, a suíte HTTP de negócio acrescenta **8** e recuperação de pagamentos acrescenta **3**: **73 testes aprovados** nesta revisão. As 7 verificações de UI real, o build e as nove restaurações são evidências adicionais, não testes contados nesse total.

A suíte de isolamento acrescenta **5 testes integrados aprovados** (agrupador e quatro cenários). Tentativas anteriores do helper de execução SQL via Compose/stdin encerraram por `ETIMEDOUT`; o helper foi corrigido para sessões `docker exec` no contêiner QA com projeto verificado antes da execução final aprovada. Isso não foi registrado como aprovação da versão anterior nem como falha da migração `002`.

Na suíte HTTP final, os sete cenários e seu agrupador passaram: dois perfis e instituição fixa com vários organizadores; responsabilidade cumulativa para IDs/listagens/exportações e participante em outra instituição; oito pedidos simultâneos para três vagas, rejeição de escrita excedente e cancelamento FIFO; aprovação/recusa/expiração com replay e callbacks internos concorrentes iguais/contraditórios; expiração por worker com Events parado, promoção paga após recuperação e aprovação tardia sem reativação; confirmação/idempotência com Notifications, Reporting e RabbitMQ parados e outbox pendente persistida; check-ins concorrentes gerando um registro, certificado bloqueado antes da conclusão, emissão idempotente e verificação pública válida. O cenário de expiração torna `expires_at` vencido por fixture no banco; comprova a detecção autônoma, sem medir a passagem natural dos 120 segundos do TTL de QA. Não se infere entrega SMTP ou drenagem integral de filas apenas da confirmação durante a falha.

Tentativas anteriores da suíte HTTP tiveram timeout de inicialização e HTTP 503 no cadastro enquanto builds/restaurações concorriam. Após término dessas operações e readiness, a execução final acima passou na versão com expiração em thread independente. Os erros iniciais não foram omitidos nem contados como aprovação.

A navegação real confirmou login e catálogo de participante; inscrição gratuita com confirmação direta; inscrição paga com aprovação e confirmação; bloqueio de participante em rota de organizador; login de organizador pela entrada de participante sem mudar perfil/instituição; relatório com transação aprovada simulada e ocupação; preview do organizador sem acesso às inscrições pessoais. Nas 16 capturas, `scrollWidth` corresponde à largura de 1440 ou 390 px e `brokenImages=[]`; `errors=[]` registra ausência de erros JavaScript não tratados. O JSON mantém também observações de rede e tentativas de login. Essa evidência comprova os fluxos e tamanhos exercitados, sem afirmar fidelidade visual pixel a pixel a todos os anexos.

O manifesto de backup local registra restauração bem-sucedida e `tableCount` de `identity_db=8`, `event_db=2`, `registration_db=6`, `payment_db=1`, `notification_db=1`, `attendance_db=1`, `certificate_db=3`, `reporting_db=3` e `provider_db=1`. Os clones temporários foram removidos pelo auxiliar após a conferência. Dumps e hashes permanecem no diretório local protegido, sem copiar dados pessoais para este relatório. Essa evidência de restaurabilidade não comprova consistência entre serviços em atividade nem substitui verificações de linhas/invariantes, papéis e filas de um procedimento de produção.

## Evidências ainda pendentes

| Verificação | Estado nesta revisão do relatório | Condição de conclusão |
| --- | --- | --- |
| Promoção das imagens aprovadas ao stack local `eventhub`, porta 8080 | **PREPARADA; resultado de execução ainda não registrado** | `scripts/promote-local-validated.mjs` confere backup/UI/suíte HTTP, bloqueia contexto Docker remoto e conflitos de dados, preserva tags anteriores e promove as imagens QA. A conclusão exige `status=updated_and_ready` em `tmp/rules-qa/local-deployment.json` e verificação posterior do destino. Backup local 9/9 já restaurado em clones QA. |
| Implantação/verificação posterior em produção remota | **NÃO EXECUTADA; destino não identificado/acessível** | Destino autorizado, backup restaurável e decisões sobre conflitos reais, aplicação coordenada e smoke tests do destino. O stack local não é produção remota. |
| Ensaio de pico 20× | **NÃO EXECUTADO; carga base não definida** | Definir volume base, recursos, duração e critério de êxito antes de medir. Concorrência de capacidade não demonstra throughput 20×. |

Uma inicialização Docker lenta não deve ser registrada como falha de negócio antes da readiness. O [runbook](../deployment/business-rules-runbook.md) exige aguardar saúde e `/api/status` pronto antes de iniciar a suíte de negócio. Resultados pendentes devem ser substituídos apenas após saída final verificável, preservando falhas relevantes e a validação posterior à correção.

## Decisões de produto e dados em aberto

Permanecem sem definição: admissão/convite de organizadores em instituição existente; transferência/desligamento institucional; delegação de eventos; classificação dos usuários e responsáveis legados reais; percentual de presença ou controle de saída; critérios adicionais de conclusão; reembolso real; e carga base do pico 20×. A cardinalidade permite vários organizadores na instituição, mas a fixture que provisiona um colega em QA não cria uma política pública de admissão.

Foram preservadas as políticas preexistentes compatíveis: TTL padrão de 900 segundos configurável; FIFO por `created_at,id`; promoção gratuita para confirmação e paga para reserva; cancelamento confirmado antes do início; check-in do início até 24 horas após o término; certificado por atividade concluída com presença íntegra. O bootstrap isolado usa TTL de **120 segundos** para teste, sem alterar o padrão do produto. Nenhuma dessas durações foi atribuída ao DOCX sem fundamento.
