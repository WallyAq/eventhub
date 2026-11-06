# Presença e credenciamento

Base externa `/api`; serviço `attendance` na porta interna 8000, com banco exclusivo `attendance_db`. Variáveis: `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `INTERNAL_API_KEY`, `IDENTITY_URL`, `EVENTS_URL` e `REGISTRATIONS_URL`. Nenhum serviço lê tabelas de outro domínio. Migração automática sob advisory lock `46001`.

| Método e rota | Acesso e resposta |
| --- | --- |
| POST /attendance/check-ins | Organizador vinculado ao evento; recebe `{registrationId}` e retorna `{attendance}` |
| POST /attendance/credentials/resolve | Organizador vinculado; recebe `{eventId, activityId?, credential}` e retorna `{registration, attendance}` para conferência antes do check-in |
| GET /attendance/registrations/:id | Titular da inscrição ou organizador vinculado; retorna `{attendance: objeto ou null}` |
| GET /organizer/events/:id/attendance | Organizador vinculado; filtros `activityId`, `page` (1–100000), `limit` (1–100, padrão 25); retorna `{attendance: [], total, page, limit}` |
| GET /internal/attendance/registrations/:id | Credencial interna; `{attendance: objeto ou null}`; não publicado pelo Gateway |
| GET /internal/attendance/events/:id | Credencial interna; `limit` (1–500), `offset` (0–1000000); `{attendance: [], total, limit, offset}`; não publicado pelo Gateway |
| GET /health, GET /ready | Saúde e conexão com o banco próprio |

O organizador pode selecionar uma inscrição, ler o QR pela câmera, enviar uma imagem PNG/JPEG ou colar a credencial. A câmera requer HTTPS ou localhost e autorização explícita; a captura é encerrada ao detectar um código, desligar ou fechar o modal. O QR real fica no comprovante e em Minhas inscrições, para inscrições confirmadas. A leitura apenas consulta e mostra nome, e-mail e atividade; a confirmação usa `POST /attendance/check-ins`.

O Identity valida a sessão; o Event verifica o vínculo com a organização mediante `?managed=true`, antes de consultar a credencial. Registration valida o HMAC-SHA256 de `eventhub:check-in:v1:<registrationId>:<assinatura>`, vinculado também ao usuário e à atividade, utilizando a chave interna. Não aceita URLs arbitrárias, credenciais adulteradas ou de outro evento/atividade. A resolução interna não é publicada pelo Gateway. A rotação da chave interna exige atualizar o QR exibido; comprovantes antigos devem ser reabertos.

Somente uma inscrição `CONFIRMED` em evento `PUBLISHED` pode registrar presença. A resolução também confere a janela de presença; a confirmação revalida as condições atuais.

O período de credenciamento vai do início da atividade até 24 horas após seu término, com as duas extremidades incluídas. A marcação usa o relógio do servidor; o cliente não pode fornecer uma data de presença nem substituir o responsável. O banco grava `id`, `registrationId`, `eventId`, `activityId`, `userId`, `markedBy`, `checkedInAt`, `createdAt` e os títulos do evento e atividade. Não armazena CPF, telefone, e-mail ou informações bancárias.

`registration_id` possui restrição `UNIQUE`. Repetições e requisições concorrentes retornam o primeiro registro, preservando a data e o responsável originais. Uma repetição autorizada pode recuperar presença já gravada mesmo após o período de credenciamento; continua exigindo sessão, vínculo, inscrição confirmada e evento publicado. Não há alteração nem exclusão de presença nesta entrega. Certificate deve verificar novamente o estado atual de Event e Registration para emitir e validar documentos.

As listas de organizador ordenam `checked_in_at DESC, id`; as listas internas ordenam `ASC, id`. Cada página e seu total são obtidos na mesma transação `REPEATABLE READ`, somente leitura. Entre páginas separadas podem existir novas marcações; consumidores devem conferir totais/IDs e repetir a conciliação se a coleção mudou.

Falhas retornam 401 para sessão/chave inválida, 404 para inscrição/evento/vínculo inexistente, 409 para estado ou período incompatível, 422 para parâmetros inválidos e 503 para dependência indisponível. A ausência de presença retorna `null` apenas após autorização. Logs incluem request ID, método, caminho, status e duração; não registram corpo, tokens nem dados pessoais.
