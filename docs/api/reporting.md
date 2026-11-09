# Reporting — relatórios de eventos

O frontend oferece o painel geral em `/organizacao/painel` e o painel por evento em `/organizacao/eventos/:id/painel`. O relatório inclui `registrationsByDay: [{day, count}]`, calculado pelas datas de criação das inscrições no fuso de Fortaleza. O total é diário; o frontend apresenta a soma acumulada com tabela alternativa acessível. Os agregados e o CSV continuam identificando explicitamente a receita simulada, sem cobrança real. O painel geral consulta somente eventos gerenciados pela conta e não apresenta totais incompletos como se fossem definitivos.

Serviço Python/FastAPI em `services/reporting`, banco próprio `reporting_db`. Não acessa tabelas de outros serviços. Projeções `registration_projection` e `event_projection` contêm somente os dados necessários a agregados por evento/atividade, sem nome, e-mail, CPF ou telefone de participantes.

## Endpoints e autorização

| Método | Caminho | Resultado |
| --- | --- | --- |
| GET | `/reports/events/:eventId` | `{report}` com totais por estado e atividade, presença e receita simulada |
| GET | `/reports/events/:eventId/export.csv` | Exportação privada dos mesmos agregados, UTF-8 com BOM |
| GET | `/health`, `/ready` | Liveness e disponibilidade do banco/tabela próprios |

As consultas exigem Bearer token e gestão do evento via `Events /events/:eventId?managed=true`. Um evento público não torna seu relatório público. Participante sem vínculo organizacional recebe acesso recusado antes de qualquer consulta à projeção.

O relatório retorna `eventId`, `eventTitle`, `eventStatus`, `total`, `byStatus`, `attendanceCount`, `confirmedAttendanceCount`, `simulatedRevenueCents`, `activities`, `checkedAt`, `complete:true`, `consistency:"EVENTUAL_API_RECONCILIATION"` e `paymentMode:"SIMULATED"`.

Os estados são `CONFIRMED`, `PENDING_PAYMENT`, `WAITLISTED`, `CANCELLED` e `EXPIRED`. Reservas cujo prazo já terminou são contadas efetivamente como `EXPIRED`, mesmo se o worker de Registration ainda não tiver persistido a transição. Reporting não modifica inscrições. `attendanceCount` conta os registros de presença correspondentes à mesma inscrição/usuário/atividade/evento; `confirmedAttendanceCount` restringe esse total às inscrições atualmente confirmadas.

`simulatedRevenueCents` soma os preços das inscrições `CONFIRMED`. Não inclui fila, reservas pendentes, canceladas ou expiradas. O campo `revenueBasis` é `CONFIRMED_REGISTRATION_PRICES_NO_REAL_SETTLEMENT`: **não representa dinheiro liquidado, contabilidade, estorno ou pagamento bancário real**. Pagamentos permanecem simulados para a entrega acadêmica.

O CSV não contém dados pessoais de participantes. Títulos livres são protegidos contra fórmulas de planilha (prefixo literal para `=`, `+`, `-`, `@`, controles e espaços iniciais). A resposta usa `Cache-Control: private, no-store`.

## Projeções, deduplicação e reconciliação

Reporting consome `registration.#` do exchange `eventhub` em fila durável própria `eventhub.reporting`. Mensagens são confirmadas após commit. O ID da mensagem é registrado na mesma transação que atualiza a projeção; entrega repetida não aplica a mesma mensagem novamente. Falhas são republicadas com contador, e após três tentativas vão para a fila `.failed`. Uma falha de publicação não confirma a mensagem original.

Uma mensagem não aplica cegamente seu estado: identifica o evento da inscrição e consulta snapshots atuais das fontes. Assim, uma mensagem antiga `registration.confirmed` entregue depois do cancelamento não restaura a inscrição na projeção. Um advisory lock por evento serializa a leitura das fontes e a gravação da projeção, incluindo requisições HTTP concorrentes.

Todo acesso autorizado ao relatório também reconcilia suas projeções com as APIs privadas, funcionando como bootstrap para dados anteriores à criação da fila e recuperação de mensagens enviadas à DLQ. Usa:

- `Registration GET /internal/events/:id/registrations?limit=500&offset=0` → `{registrations,total,limit,offset}`;
- `Attendance GET /internal/attendance/events/:id?limit=500&offset=0` → `{attendance,total,limit,offset}`.

As páginas usam a ordem estável definida pelos serviços proprietários. Reporting recusa totais que mudem entre páginas, IDs duplicados, páginas incompletas ou dados de outro evento. Nesses casos, dependência indisponível ou banco indisponível, a requisição falha (`503`) em vez de retornar relatório parcial ou marcar dados antigos como atuais. O limite configurável `REPORT_MAX_ROWS` (padrão `100000`) limita snapshots muito grandes; ultrapassá-lo também recusa o relatório explicitamente.

As consultas entre serviços não formam uma transação distribuída. `checkedAt` indica o término da reconciliação observada, não uma garantia de simultaneidade entre os bancos. Mudanças concorrentes de estado com a mesma quantidade de registros serão refletidas na próxima mensagem ou consulta. A atualização de presença ocorre no acesso ao relatório, mesmo sem evento RabbitMQ próprio de presença.

## Configuração e execução

Variáveis: `PGHOST`, `PGPORT`, `PGDATABASE=reporting_db`, `PGUSER`, `PGPASSWORD`, `EVENTS_URL`, `REGISTRATIONS_URL`, `ATTENDANCE_URL`, `INTERNAL_API_KEY`, `RABBITMQ_HOST` (padrão `rabbitmq`), `RABBITMQ_USER`, `RABBITMQ_PASSWORD`; alternativamente `RABBITMQ_URL`. Opcionais: `REPORTING_QUEUE` e `REPORT_MAX_ROWS`.

A migração usa advisory lock. O processo roda como usuário sem privilégios na porta `8000`. Logs contêm IDs de requisição e tipo de erro, sem chave interna, token de autenticação, conteúdo das mensagens ou dados pessoais. `ready` verifica banco e tabela; o consumidor reconecta ao broker automaticamente, e consultas síncronas ainda exigem fontes HTTP disponíveis.

Testes: `python -m unittest discover -s services/reporting/test -v`. Cobrem agregados e receita simulada, expiração efetiva, associação exata de presença, autorização antes de acesso, páginas inconsistentes, neutralização de fórmulas, mensagens duplicadas, mensagens fora de ordem e rollback diante de falha de reconciliação.
