# Identity — contrato v1 do protótipo

Base externa: /api. JSON em UTF-8. Respostas com X-Request-ID. Dados da conta e tokens retornam Cache-Control: no-store.

## POST /api/auth/register

Público. Corpo: `{"name":"Maria Silva","email":"maria@example.test","password":"uma senha de exemplo"}`.

201: `{"user":{"id":"uuid","name":"Maria Silva","email":"maria@example.test","role":"PARTICIPANT","createdAt":"ISO-8601","updatedAt":"ISO-8601"}}`.

Nome: 2–120 caracteres após trim; e-mail normalizado para minúsculas e limitado a 254 caracteres; senha: 8–128 caracteres, sem trim. Campos desconhecidos são rejeitados. O cliente não escolhe papel, id ou datas. A senha nunca retorna na resposta.

Campos opcionais: cpf (11 dígitos após normalização, ou vazio), phone (10–15 dígitos, ou vazio), marketingOptIn (booleano) e termsAccepted (quando informado, deve ser true). O servidor registra a data do aceite. CPF e telefone não são validados em serviços externos nem por dígitos verificadores. As respostas de usuário incluem cpf, phone e marketingOptIn.

Para cadastro institucional, envie também organization com cnpj (14 caracteres alfanuméricos após normalização), legalName e tradeName (2–120 caracteres), entityType (1–80 caracteres) e phone (10–15 dígitos). O e-mail institucional inicial vem da conta. Conta, instituição e vínculo OWNER são criados em uma transação; uma falha desfaz o conjunto. CNPJ tem unicidade, sem consulta cadastral ou validação de dígitos verificadores.

400 para entrada inválida; 409 para e-mail ou CNPJ já cadastrado. Restrições UNIQUE no PostgreSQL protegem também cadastros simultâneos.

## POST /api/auth/login

Público. Corpo: `{"email":"maria@example.test","password":"uma senha de exemplo"}`.

200: objeto com accessToken, tokenType Bearer, expiresIn 3600 e user no formato anterior. O frontend persiste token, usuário e prazo absoluto em localStorage (eventhub.session.v1) para restaurar o login por até uma hora. Não há refresh token ou renovação automática. Logout remove o cache e sincroniza a saída nas demais abas da mesma origem.

401 e mensagem única para e-mail inexistente ou senha incorreta. 400 para formato inválido.

## GET /api/users/me

Authorization: Bearer TOKEN. Gateway e Identity verificam assinatura e claims. O Identity consulta pelo sub do token, não por um id fornecido pelo cliente.

200: `{"user":{...}}`. 401 para token ausente, inválido, expirado ou usuário inexistente.

## PATCH /api/users/me

Authorization: Bearer TOKEN. Corpo: `{"name":"Maria Atualizada"}`.

200 com user atualizado. name é obrigatório; cpf e phone são opcionais, com as regras do cadastro. Campos omitidos preservam seus valores. email, role, id e password são rejeitados neste endpoint. Não há consulta ou atualização pública por id.

## POST /api/users/me/password

Authorization: Bearer TOKEN. Corpo: currentPassword e newPassword, ambas com 8–128 caracteres. Verifica a senha atual, rejeita reutilização e grava um novo hash. A atualização compara o hash anterior para impedir que alterações concorrentes sobrescrevam uma senha mais recente.

200: updated true. 400 para senha atual incorreta ou nova senha igual; 409 para alteração concorrente. O frontend encerra a sessão local após sucesso. JWTs já emitidos permanecem válidos até sua expiração; não há revogação imediata.

## Erros e limites

Formato de erro: error, message (quando disponível) e requestId. O Gateway retorna 503 identity_unavailable se o Identity não responder em até 5 segundos. Entradas acima de 16 KiB retornam 413. JSON malformado retorna 400.

Cadastro, login e troca de senha compartilham limite de 30 requisições por IP a cada 15 minutos por instância Identity; 429 inclui Retry-After. O Gateway repassa o IP obtido do proxy confiável; somente o Nginx publica porta no host. O contador é em memória e não constitui limitação distribuída.

## JWT

RS256; issuer eventhub-identity; audience eventhub-api; claims sub (UUID do usuário), role PARTICIPANT, iat e exp. Validade e idade máxima de uma hora no Identity e Gateway. Chave privada somente no Identity; pública no Identity e Gateway. Algoritmos diferentes são rejeitados. Tokens antigos mantêm a data de expiração original.

## Recorte

Inclui cadastro/login, perfil e troca de senha autenticada. Organizações e vínculos estão em [organizations.md](organizations.md); não alteram o papel global do usuário. Recuperação com entrega local simulada está em [business.md](business.md). Alteração/verificação de e-mail e revogação de sessão permanecem pendentes. Logout remove o token da memória; um token emitido permanece válido até expirar.

