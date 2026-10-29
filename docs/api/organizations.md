# Organizações — contrato do protótipo

Base externa: /api. Todos os endpoints exigem Authorization: Bearer TOKEN. Gateway valida JWT; Identity valida novamente e verifica o vínculo no banco. Respostas têm Cache-Control: no-store e X-Request-ID.

## Modelo e permissões

O papel global do usuário continua PARTICIPANT. Os vínculos são específicos por organização: OWNER (responsável) ou ORGANIZER (organizador). Um usuário pode participar de várias organizações com papéis distintos. Esses vínculos não são gravados no JWT.

Todos os membros podem consultar a organização e sua equipe. Apenas OWNER pode editar os dados da organização ou adicionar organizadores. O criador recebe OWNER em uma transação junto à criação da organização. Existe no máximo um OWNER por organização; transferência e remoção de membros não estão disponíveis nesta versão.

## GET /api/organizations

200: organizations, lista somente das organizações do usuário, ordenada por criação e id. Lista vazia quando não há vínculos.

## POST /api/organizations

Corpo: name (2–120 caracteres após trim), description opcional (até 2000 caracteres). Campos desconhecidos, incluindo ownerId e role, são rejeitados.

201: organization com id, name, description, createdAt, updatedAt e membershipRole OWNER.

Nomes não são únicos globalmente: organizações distintas podem ter o mesmo nome, sem compartilhar dados.

## GET /api/organizations/:id

200: organization com os mesmos campos e membershipRole específico do usuário. 404 tanto para organização inexistente quanto para usuário sem vínculo.

## PATCH /api/organizations/:id

Somente OWNER. Corpo com name e/ou description, pelo menos um deles. 200: organization atualizada. Nenhuma alteração de membro ou papel é aceita neste endpoint.

## GET /api/organizations/:id/members

200: members, cada um com id do usuário, name, email, role e createdAt do vínculo. Somente membros da mesma organização podem consultar.

## POST /api/organizations/:id/members

Somente OWNER. Corpo: email de uma conta já cadastrada, normalizado para minúsculas. 201: member com id, role ORGANIZER e createdAt. Não aceita role ou userId do cliente.

Adiciona o vínculo imediatamente; não envia convite ou e-mail e não altera a senha ou o papel global da pessoa. 404 se a conta não existe; 409 se já pertence à organização. Uma restrição de unicidade protege contra duplicatas inclusive em requisições concorrentes.

## Erros

400: entrada inválida ou UUID malformado. 401: token ausente/inválido. 403: membro sem papel de responsável tentou uma operação exclusiva do OWNER. 404: organização sem acesso ou conta destinatária inexistente. 409: membro duplicado. 503: dependência indisponível. Erros seguem o formato error, message e requestId do Identity.

## Próxima integração

Event será proprietário dos eventos e suas organizações responsáveis. Antes de criar ou alterar um evento, deverá validar identidade e autorização na organização por API; não consultará tabelas do Identity. Essa integração ainda não está implementada.
