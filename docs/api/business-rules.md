# Regras e contratos do EventHub

## Identidade e autorização

Organização e instituição são a mesma entidade no modelo. Cada conta possui um único `role`: `PARTICIPANT` ou `ORGANIZER`. O participante acessa seus dados e pode se inscrever em eventos publicados de qualquer instituição. O organizador possui exatamente um `organizationId`; uma organização admite vários organizadores. O responsável do evento deve pertencer à organização do evento. Perfil, instituição e responsabilidade são validados usando o usuário atual do Identity, mesmo que a requisição contenha JWT anterior, IDs ou campos adulterados.

Selecionar uma área na entrada serve à navegação; não altera a conta. Operações administrativas passam por `GET /events/{id}?managed=true` com a autorização original. Esse contrato valida simultaneamente perfil, instituição e responsabilidade pelo evento, mesmo quando a chamada também contém a chave interna. Publicação de evento e vínculo institucional isoladamente não concedem acesso operacional.

Não há acesso público ao prefixo `/internal`. Chamadas internas exigem `x-internal-key`, transmitido somente entre serviços, nunca para o navegador. O gateway mantém uma lista explícita de rotas públicas/protegidas. Os serviços confrontam o contexto autenticado com o recurso; ocultar botão não é o mecanismo de autorização.

## Inscrição e pagamento

Estados de inscrição: `WAITLISTED`, `PENDING_PAYMENT`, `CONFIRMED`, `CANCELLED`, `EXPIRED`. Uma solicitação gratuita com vaga confirma; uma paga com vaga reserva até `expiresAt`; sem vaga entra na espera apenas quando habilitada. Inscrições confirmadas e reservas ainda válidas ocupam vaga. Estados terminais não podem voltar a ativo por callback tardio. O inventário da atividade é a fronteira de serialização; toda mudança de ocupação utiliza transação e proteção no PostgreSQL. O pagamento e o provedor são proprietários dos próprios bancos; não escrevem tabelas de inscrição diretamente.

O participante envia uma chave idempotente de solicitação; a combinação usuário/chave e a inscrição ativa por usuário/atividade são únicas. Repetição não cria segunda ocupação. `POST /internal/registrations/{id}/payment` aceita apenas resultado válido do contrato interno; confirma somente reserva paga vigente. Resultados repetidos devem preservar o primeiro estado válido; resultado contraditório não pode reativar cancelada/expirada. `Payments` reconcilia uma transação `PENDING` periodicamente após falha de dependência. O resultado do provedor pode ser `APPROVED` enquanto o resultado efetivo é `EXPIRED`, se a reserva terminou antes da confirmação.

O TTL existente é configurável por `RESERVATION_TTL_SECONDS` (padrão preexistente 900 segundos; QA usa prazo menor). A manutenção em segundo plano expira reservas sem depender de navegação do usuário. A política preexistente de espera é FIFO por data e ID: vaga gratuita confirma o próximo; paga oferece reserva com TTL. Cancelar confirmada é permitido antes do início da atividade pelo comportamento preexistente. Não foram criadas regras de reembolso, novos prazos de cancelamento ou percentuais de presença.

Registrations executa a expiração em `expiry_worker`, thread própria que consulta somente PostgreSQL e grava estado/outbox sob a proteção do inventário. Ela não chama Events nem RabbitMQ. A promoção da espera, reconciliação com Events e publicação da outbox executam em outra thread; lentidão dessas dependências não ocupa o ciclo de expiração. A atualização persistida continua sujeita às transações e à disponibilidade do PostgreSQL, sem promessa de execução em instante exato do relógio.

## Check-in e certificado

`POST /attendance/check-ins` recebe `{registrationId}` e valida organizador responsável, evento publicado, inscrição confirmada e atividade correspondente. A janela preexistente é do início da atividade até 24 horas após seu término. `UNIQUE(registration_id)` é a proteção contra duplicação, inclusive em requisições simultâneas. Repetir uma operação autorizada retorna a presença existente. A autorização é verificada antes da resposta idempotente; perder responsabilidade não mantém acesso ao registro.

`POST /attendance/credentials/resolve` recebe `{eventId, activityId?, credential}` e não substitui a autorização do organizador. A credencial assinada é confrontada com inscrição, usuário e atividade. `GET /attendance/registrations/{id}` permite o participante dono ou responsável autorizado pelo evento. Os endpoints internos de presença exigem chave de serviço.

`POST /certificates` recebe `{registrationId}`. Requisitos cumulativos: evento publicado; inscrição confirmada; atividade do evento encerrada; presença com `registrationId`, `userId`, `eventId` e `activityId` correspondentes; check-in dentro da janela existente. Essa é a regra de conclusão implementada antes desta entrega: término da atividade e presença válida. Controle de entrada/saída, percentual mínimo ou avaliação de conclusão não foram definidos nem simulados.

A emissão é única por inscrição e grava snapshot imutável e hash. Nova tentativa válida retorna o certificado existente. Detalhe/download verificam titularidade ou responsabilidade e validade atual; cancelamento ou adulteração invalida a consulta, sem apagar o histórico. A verificação pública expõe nome, evento, atividade, organização, carga horária e integridade, sem CPF, telefone, e-mail ou IDs operacionais de usuário/inscrição/presença. Modelos e certificados de palestrantes também exigem o evento administrável.

## Indicadores e pagamentos internos

`GET /reports/events/{eventId}` e `GET /reports/events/{eventId}/export.csv` exigem evento administrável antes de consultar o banco de Reporting. Reporting reconstrói a projeção por APIs paginadas de Events, Registrations e Attendance; não consulta o banco de outro serviço. Mensagens repetidas são deduplicadas e sempre provocam leitura do estado atual, evitando aplicar um estado antigo fora de ordem.

O relatório mantém campos existentes e acrescenta, por atividade e no total:

- `capacity`, `reservedCount`, `occupiedCount`, `availableCount`, `occupancyPercent`, `overCapacityCount`: ocupação é confirmadas + reservas vigentes; uma reserva vencida é classificada como expirada no snapshot, inclusive antes da convergência do worker.
- `paidRegistrationCount`, `freeRegistrationCount`: quantidade por preço da inscrição, incluindo histórico.
- `payments.available`: indica se a fonte de transações foi consultada com sucesso. Em falha, as contagens financeiras não são apresentadas como zero; inscrições/ocupação/presença continuam disponíveis.
- `payments.byStatus`: transações `PENDING`, `APPROVED`, `DECLINED`, `EXPIRED`; `providerByStatus` mantém o resultado do provedor separado do estado efetivo; `approvedAmountCents`, `transactionCount`, `withoutTransactionCount` refletem os dados efetivos do serviço Payments. Todos os valores permanecem simulados.

`simulatedRevenueCents` e `revenueBasis=CONFIRMED_REGISTRATION_PRICES_NO_REAL_SETTLEMENT` preservam compatibilidade: representam os preços das inscrições confirmadas. Não equivalem a dinheiro liquidado ou reembolso. O novo bloco `payments` representa transações consultadas no Payments. Não se substitui a base antiga silenciosamente.

Contrato interno adicionado:

```http
POST /internal/payments/query
x-internal-key: <credencial de serviço>
Content-Type: application/json

{"registrationIds":["<uuid>"]}
```

Até 500 IDs UUID por lote, corpo estrito, resposta `{payments:[{registrationId,amountCents,status,providerStatus,correlationId,...}]}`. Ausência de uma transação é representada pela ausência do respectivo ID na lista. A consulta não inicia/reconcilia pagamentos e não contém identidade pessoal. Reporting solicita apenas IDs obtidos da consulta autorizada do evento, rejeita IDs inesperados/duplicados e preços divergentes. A chave de serviço não é uma permissão administrativa de usuário. O endpoint não é encaminhado pelo gateway.

O CSV acrescenta ocupação, disponibilidade da fonte de pagamentos, contagens e valor aprovado. Campos financeiros ficam vazios quando a fonte está indisponível. Títulos que possam ser interpretados como fórmulas de planilha são tratados como texto. `checkedAt` identifica o momento da reconstrução; a consistência entre APIs é eventual e não constitui uma transação distribuída.

## Comunicação e recuperação

Registrations grava inscrição + outbox atomicamente; Events mantém sua própria outbox de comunicações. O publisher envia mensagens duráveis a RabbitMQ com confirmação e só marca `published_at` após envio confirmado. Notifications e Reporting operam fora da transação de inscrição; falhas desses consumidores ou de envio não revertem a inscrição.

As notificações usam eventos versão 1 com `id`, `type`, `registrationId`, `userId`, `correlationId` e `requestId`, mais dados específicos de pagamento ou anúncio. Tipos: `registration.reserved|confirmed|waitlisted|cancelled|expired`, `payment.approved|declined|expired`, `event.updated|cancelled`. Dados de destinatário são resolvidos nas APIs proprietárias e confrontados com a inscrição. IDs de mensagem são únicos no banco de entregas; `SENT` deduplica replays. Tentativas malsucedidas são persistidas, limitadas e encaminhadas à fila de falhas.

Republish de retry/DLQ usa confirmação **e** `mandatory=true`; mensagem sem rota não recebe ACK da entrega original e pode ser recuperada pelo broker. SMTP e banco não participam de uma transação comum: se SMTP aceitar e o processo falhar antes de gravar `SENT`, uma repetição do e-mail é possível. O `Message-ID` estável ajuda correlação; não se promete entrega exatamente uma vez. A inscrição permanece íntegra.

Headers `x-request-id` e `x-correlation-id` são validados e propagados; a inscrição armazena `correlationId`, reutilizado por pagamentos/outbox/consumidores. Logs estruturados registram operação, serviço, estado, duração e IDs técnicos, sem credencial interna/JWT/senhas. `scripts/trace-registration.mjs` auxilia a busca nos logs do Compose.
