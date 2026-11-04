# Eventos, inscrições e pagamento simulado

Base externa `/api`. Gateway encaminha somente rotas explícitas; callbacks `/internal` não são publicados. Serviços validam a conta por API do Identity; Event consulta o vínculo da organização por operação protegida. Comunicação interna usa DNS do Compose e credencial por variável de ambiente. Nenhum serviço consulta tabelas de outro banco.

## Event — event_db

| Método e rota | Comportamento |
| --- | --- |
| GET /events | Eventos publicados, sem e-mail dos palestrantes |
| GET /events?managed=true | Eventos das organizações do usuário autenticado, com contatos dos palestrantes |
| GET /events/:id | Publicado é público; rascunho/cancelado exige vínculo; sempre omite e-mail dos palestrantes |
| GET /events/:id?managed=true | Detalhe com contatos; exige vínculo com a organização, inclusive se publicado |
| POST /events | Cria rascunho para uma organização do usuário |
| PUT /events/:id | Substitui somente rascunho, sem transferir organização |
| POST /events/:id/publish | Publica antes do início; repetição é idempotente |
| POST /events/:id/cancel | Cancela sem republicação; repetição é idempotente |

Criação/edição recebe organizationId, title, description, category, hours, modality (Presencial/Híbrido/Online), location, streamUrl, startsAt, endsAt, sessionTime, featured, speakers e activities. IDs das atividades vêm do servidor. Datas ISO-8601 informam fuso; término deve ser posterior ao início; atividades ficam dentro do período. Capacidade inteira positiva; preço inteiro em centavos, mínimo zero. Online/híbrido exige plataforma HTTPS. É obrigatória ao menos uma atividade.

Cada palestrante recebe `name` (2–120 caracteres) e `institution` (até 160), preservando o contrato anterior. Os campos opcionais são:

| Campo | Contrato |
| --- | --- |
| id | UUID criado pelo cliente; padrão null. IDs informados não podem se repetir no evento |
| degree | Titulação de até 100 caracteres; padrão vazio |
| email | Contato de até 254 caracteres; padrão vazio. Quando preenchido, exige formato de e-mail sem espaços |
| biography | Biografia de até 400 caracteres; padrão vazio; texto contendo apenas espaços é inválido |

Cada atividade recebe `title`, `startsAt`, `endsAt`, `location`, `responsible`, `capacity` e `priceCents`, além dos campos opcionais:

| Campo | Contrato |
| --- | --- |
| kind | Curso, Minicurso, Workshop ou Palestra; padrão Workshop |
| description | Até 5000 caracteres; padrão vazio; texto contendo apenas espaços é inválido |
| waitlistEnabled | Booleano estrito; padrão true. Não aceita strings ou números como booleano |
| speakerId | UUID de um palestrante do mesmo evento; padrão null |

Quando `speakerId` é informado, deve corresponder a exatamente um palestrante do evento. O servidor deriva `responsible` do nome desse palestrante, substituindo eventual nome divergente enviado pelo cliente. Referências inexistentes e IDs repetidos retornam 422. Palestrantes antigos sem ID e responsáveis livres continuam aceitos. Os novos campos são persistidos no JSONB do Event, sem acesso a outros bancos.

O e-mail do palestrante é um contato administrativo: não aparece nas listagens públicas nem no detalhe padrão, mesmo com token de participante ou organizador. A edição deve consultar `?managed=true`, que valida o vínculo institucional antes de devolver contatos. Um token inválido ou uma dependência indisponível nunca transforma a consulta em acesso autorizado. As respostas protegidas de criação, edição e transição preservam os contatos. A consulta pública de um evento publicado não depende do Identity para filtrar os contatos.

Preço, capacidade, programação e demais campos do evento publicado são imutáveis nesta versão; isso inclui dados dos palestrantes e configuração da lista de espera. Respostas: event ou events. 401 sem identidade, 404 sem vínculo/inexistente, 409 para transição proibida, 422 para campos inválidos e 503 para dependência indisponível.

## Registration — registration_db

| Método e rota | Comportamento |
| --- | --- |
| POST /registrations | eventId e activityId; exige Idempotency-Key de 8–100 caracteres |
| GET /registrations | Inscrições do próprio participante |
| GET /registrations/:id | Inscrição própria, conciliando prazo/cancelamento |
| POST /registrations/:id/cancel | Cancela inscrição própria e promove a fila |
| GET /events/:id/availability | Agregado público de vagas por atividade de evento publicado; calculado por Registration |

A consulta de disponibilidade retorna `{eventId, checkedAt, activities: [{activityId, capacity, availableSeats}]}`. O Gateway encaminha somente essa rota ao Registration (`GET /availability/events/:id` na rede interna). Registration valida o evento pela API de Event; rascunhos e cancelados retornam 404, sem divulgar programação privada. Eventos iniciados retornam zero vagas para novas inscrições.

Uma consulta agregada ao banco do próprio Registration desconta confirmações e reservas de pagamento ainda válidas, usando `statement_timestamp()` do PostgreSQL. Reservas vencidas e estados cancelado/expirado não ocupam vagas. Event continua proprietário da capacidade publicada; antes da primeira reserva, a capacidade vem de sua API. Vagas liberadas antes da próxima manutenção são destinadas à fila existente antes de serem oferecidas a novos participantes. A leitura não cria inventários, não expira inscrições e não promove filas; essas alterações continuam sob os locks existentes. A resposta usa `Cache-Control: no-store`, representa o instante consultado e não garante uma reserva. Falha da dependência retorna 503, sem apresentar a capacidade inicial como vagas restantes.

Resposta registration contém id, userId, activityId, eventId, eventTitle, snapshot da activity, priceCents, status, expiresAt e createdAt. Listagem usa registrations. O valor vem do Event. Mesma chave/usuário devolve a operação original; reutilização para outra atividade retorna 409. Uma nova solicitação para atividade em que o participante já tem inscrição ativa retorna 409 com a mensagem "Você já está inscrito nesta atividade." Índice parcial impede duas inscrições ativas por participante/atividade.

Toda ocupação usa lock da linha do inventário. CONFIRMED e PENDING_PAYMENT ocupam vaga; WAITLISTED não. Prazo padrão: 900 segundos, configurável em RESERVATION_TTL_SECONDS. Worker concilia prazos, cancelamentos e promoções periodicamente. Falha de Event adia a conciliação; novas reservas/aprovações falham sem confirmar por suposição. A expiração usa o relógio do PostgreSQL antes de confirmar pagamento.

Se `activity.waitlistEnabled` for false e a atividade estiver lotada após a manutenção das reservas, a nova solicitação retorna 409 sem criar inscrição nem mensagem de inscrição. A decisão é tomada sob o mesmo lock do inventário, preservando a ordem de bloqueios e o controle de concorrência. Atividades antigas sem o campo mantêm a lista habilitada. Repetições com a mesma chave idempotente retornam a inscrição original; uma nova chave para uma inscrição ativa retorna 409 sem criar outro registro. O snapshot da atividade preserva a configuração enviada pelo Event.

| Origem | Condição | Destino |
| --- | --- | --- |
| Nova solicitação | Vaga e preço zero | CONFIRMED |
| Nova solicitação | Vaga e preço positivo | PENDING_PAYMENT |
| Nova solicitação | Lotada e lista habilitada (padrão) | WAITLISTED |
| Nova solicitação | Lotada e lista desabilitada | 409; não cria inscrição |
| WAITLISTED | Vaga liberada e evento aberto | CONFIRMED se gratuita; PENDING_PAYMENT com novo prazo se paga |
| PENDING_PAYMENT | Aprovação antes do prazo | CONFIRMED |
| PENDING_PAYMENT | Prazo vencido | EXPIRED |
| PENDING_PAYMENT | Recusa | CANCELLED |
| CONFIRMED | Cancelamento do participante/organizador antes da atividade | CANCELLED |
| PENDING_PAYMENT/WAITLISTED | Cancelamento do participante/organizador, inclusive após início | CANCELLED |
| Estado ativo | Cancelamento do evento | CANCELLED |
| CANCELLED/EXPIRED | Nova solicitação com outra chave | Nova inscrição, se o evento estiver aberto |

Callbacks internos autenticados: GET /internal/registrations/:id e POST /internal/registrations/:id/payment com outcome APPROVED/DECLINED/EXPIRED. Não passam pelo Gateway. Aprovação tardia/repetida não reabre estados terminais.

## Payment — payment_db

GET /payments/:registrationId consulta transação própria (payment null se inexistente). POST na mesma rota aceita somente outcome APPROVED ou DECLINED. A primeira decisão é persistida; repetir a mesma decisão retoma a conciliação, outra decisão retorna 409. O ID da inscrição é a chave única. Valor vem do Registration.

Resultado é registrado como PENDING antes de chamar Registration. Se a dependência falhar, retorna 202; worker retoma periodicamente. Só uma confirmação efetiva resulta em APPROVED. Não há cobrança, dados bancários ou estorno real. Uma transação aprovada continua como histórico se a inscrição for cancelada depois.

## Notification e RabbitMQ

Registration grava outbox na mesma transação da inscrição. Publicador usa mensagens persistentes e confirmação do broker. Fila durável notifications vinculada a registration.# no exchange topic eventhub. Entrega é pelo menos uma vez; Notification deduplica pelo ID na tabela deliveries. `MAIL_MODE=mailbox` grava uma mensagem privada local; `MAIL_MODE=smtp` consulta destinatário e inscrição pelas APIs proprietárias e envia pelo transporte configurado. Apenas aceitação bem-sucedida resulta em SENT; falhas preservam tentativas/retry/DLQ. O padrão local não envia e-mail externo.

Envelope v1: id, type, version, registrationId, userId. Tipos: registration.reserved, registration.waitlisted, registration.confirmed, registration.cancelled, registration.expired. Erros de consumo passam por até três tentativas e seguem para notifications.failed. Falha do consumidor ou broker não desfaz confirmação. Não apague volumes/filas para recuperar mensagens.

## Recuperação — Identity

POST /auth/password/forgot aceita email e retorna 202 genérico. POST /auth/password/reset aceita token e password (8–128 caracteres). Tokens aleatórios são armazenados como hash, expiram em 30 minutos e são consumidos uma vez; redefinir invalida os outros links do usuário. Limite separado de dez chamadas por IP em quinze minutos.

Por padrão, entrega em arquivos privados de /tmp/eventhub-mail dentro do Identity, sem endpoint público para consultar links. Arquivo: SHA-256 do e-mail normalizado + .json; contém path com token no fragmento da URL. Operador local pode inspecionar com docker compose exec identity; não publique esses arquivos ou tokens. Caixa efêmera em recriação do contêiner. SMTP configurável utiliza outbox durável. Logout revoga um token; troca/reset de senha e confirmação de e-mail invalidam todas as sessões anteriores. Consulte [Identity](identity.md) para contratos de sessão, e-mail e transporte, [gestão de inscritos](organizer-registrations.md), [presença](attendance.md), [certificados](certificates.md) e [relatórios](reporting.md) para os domínios novos.
