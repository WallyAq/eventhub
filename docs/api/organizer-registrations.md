# Gestão de inscrições pelo organizador

Base externa `/api`; implementada pelo Registration, no seu próprio `registration_db`. Todas as operações consultam Event com `?managed=true` e o Bearer do usuário. A chave de serviço não substitui essa verificação de vínculo com a organização. Não há consulta SQL a bancos de Identity ou Event.

| Método e rota | Contrato |
| --- | --- |
| GET /organizer/events/:id/registrations | Filtros `status`, `activityId`; `page` 1–100000 e `limit` 1–100 (padrão 25). Retorna `{registrations: [], total, page, limit}` |
| GET /organizer/events/:id/registrations/export.csv | Mesmos filtros `status` e `activityId`; exporta até 10000 inscrições em CSV UTF-8 com BOM e separador `;` |
| POST /organizer/registrations/:id/cancel | Cancela inscrição ativa, registra o ator e promove a fila conforme as regras existentes. Confirmações só podem ser canceladas antes do início. Retorna `{registration}` |
| GET /internal/events/:id/registrations | Credencial interna; `limit` 1–500 (padrão 500), `offset` 0–1000000. Retorna `{registrations: [], total, limit, offset}` sem enriquecer dados pessoais. Não publicado pelo Gateway |

Os status permitidos são `PENDING_PAYMENT`, `CONFIRMED`, `CANCELLED`, `EXPIRED` e `WAITLISTED`. `activityId` deve pertencer ao evento solicitado; nunca filtra silenciosamente uma atividade de outra organização. Conta e página usam a mesma transação `REPEATABLE READ`, somente leitura. A ordenação é `created_at DESC, id` para a gestão e `ASC, id` para integração interna. A leitura não dispara expiração ou promoção de fila: o worker existente concilia esses estados; consumidores de relatórios podem descontar reservas com prazo vencido e informar a data da observação.

Cada inscrição administrativa inclui `participant: {id, name, email}`, recuperado pelo Identity através de `/internal/users/:id`, uma vez por usuário da página. CPF, telefone, senha e hash não são retornados. Falha do Identity não produz uma lista aparentemente completa com identidades inventadas. As APIs do participante continuam restritas às próprias inscrições.

A exportação contém ID da inscrição, nome, e-mail, título da atividade, status, valor em centavos e criação. Valores que podem ser interpretados como fórmulas por planilhas recebem apóstrofo antes do conteúdo; isso cobre `=`, `+`, `-`, `@`, prefixos de espaços e tabulação/quebras de linha. O CSV usa o escritor padrão para escapar separadores, aspas e quebras de linha. Acima de 10000 inscrições retorna 409 e solicita filtros; não corta resultados sem informar. A resposta usa `Cache-Control: no-store`.

O cancelamento repete o bloqueio de inventário que serializa pagamentos, reservas e promoções. Uma repetição terminal não gera novo evento nem ação de auditoria. A primeira alteração pelo organizador grava `registration_actions` com inscrição, ator, ação e horário. Para preservar presença e certificados, confirmações só podem ser canceladas antes de `activity.startsAt`; depois disso recebem 409. Reservas não pagas e entradas na fila podem ser canceladas mesmo depois do início: esses estados não comprovam presença e seus titulares devem poder sair. O cancelamento do evento pertence ao Event, com reconciliação pelo worker de Registration.

401 indica credencial inválida, 404 indica evento/inscrição/vínculo/atividade inexistente, 409 indica cancelamento proibido ou exportação acima do limite, 422 indica filtro/paginação inválida e 503 indica dependência indisponível.
