# Identity — contrato v1 do protótipo

Base externa: /api. JSON em UTF-8. Respostas com X-Request-ID. Dados da conta e tokens retornam Cache-Control: no-store.

## POST /api/auth/register

Público. Corpo: `{"name":"Maria Silva","email":"maria@example.test","password":"uma senha de exemplo"}`.

201: `{"user":{"id":"uuid","name":"Maria Silva","email":"maria@example.test","role":"PARTICIPANT","createdAt":"ISO-8601","updatedAt":"ISO-8601"}}`.

Nome: 2–120 caracteres após trim; e-mail normalizado para minúsculas e limitado a 254 caracteres; senha: 8–128 caracteres, sem trim. Campos desconhecidos são rejeitados. O cliente não escolhe papel, id ou datas. A senha nunca retorna na resposta.

400 para entrada inválida; 409 para e-mail já cadastrado. Restrição UNIQUE no PostgreSQL protege também cadastros simultâneos.

## POST /api/auth/login

Público. Corpo: `{"email":"maria@example.test","password":"uma senha de exemplo"}`.

200: objeto com accessToken, tokenType Bearer, expiresIn 900 e user no formato anterior. Não há cookie, refresh token ou armazenamento persistente do token no frontend nesta etapa.

401 e mensagem única para e-mail inexistente ou senha incorreta. 400 para formato inválido.

## GET /api/users/me

Authorization: Bearer TOKEN. Gateway e Identity verificam assinatura e claims. O Identity consulta pelo sub do token, não por um id fornecido pelo cliente.

200: `{"user":{...}}`. 401 para token ausente, inválido, expirado ou usuário inexistente.

## PATCH /api/users/me

Authorization: Bearer TOKEN. Corpo: `{"name":"Maria Atualizada"}`.

200 com user atualizado. Apenas nome pode ser alterado; email, role, id e password são rejeitados neste endpoint. Não há consulta ou atualização pública por id.

## Erros e limites

Formato de erro: error, message (quando disponível) e requestId. O Gateway retorna 503 identity_unavailable se o Identity não responder em até 5 segundos. Entradas acima de 16 KiB retornam 413. JSON malformado retorna 400.

Cadastro e login compartilham limite de 30 requisições por IP a cada 15 minutos por instância Identity; 429 inclui Retry-After. O Gateway repassa o IP obtido do proxy confiável; somente o Nginx publica porta no host. O contador é em memória e não constitui limitação distribuída.

## JWT

RS256; issuer eventhub-identity; audience eventhub-api; claims sub (UUID do usuário), role PARTICIPANT, iat e exp. Validade de 15 minutos. Chave privada somente no Identity; pública no Identity e Gateway. Algoritmos diferentes são rejeitados.

## Recorte

Inclui cadastro/login de participantes, consulta e atualização do próprio nome. Organizações e vínculos de organizadores estão documentados em [organizations.md](organizations.md); não alteram o papel global do usuário. Troca de senha/e-mail, recuperação, verificação de e-mail e revogação de sessão permanecem pendentes. Logout local remove o token da memória; um token já emitido permanece válido até expirar.

