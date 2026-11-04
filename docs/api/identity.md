# Identity — contrato v1 do protótipo

Base externa: /api. JSON em UTF-8. Respostas com X-Request-ID. Dados da conta e tokens retornam Cache-Control: no-store.

## POST /api/auth/register

Público. Corpo: `{"name":"Maria Silva","email":"maria@example.test","password":"uma senha de exemplo"}`.

201: `{"user":{"id":"uuid","name":"Maria Silva","email":"maria@example.test","role":"PARTICIPANT","createdAt":"ISO-8601","updatedAt":"ISO-8601"}}`.

Nome: 2–120 caracteres após trim; e-mail normalizado para minúsculas e limitado a 254 caracteres; senha: 8–128 caracteres, sem trim. Campos desconhecidos são rejeitados. O cliente não escolhe papel, id ou datas. A senha nunca retorna na resposta.

Campos opcionais: cpf (11 dígitos após normalização, ou vazio), phone (10–15 dígitos, ou vazio), marketingOptIn (booleano) e termsAccepted (quando informado, deve ser true). O servidor registra a data do aceite. CPF e telefone não são validados em serviços externos nem por dígitos verificadores. As respostas de usuário incluem cpf, phone, marketingOptIn e emailVerifiedAt (null até a primeira confirmação de endereço).

Para cadastro institucional, envie também organization com cnpj (14 caracteres alfanuméricos após normalização), legalName e tradeName (2–120 caracteres), entityType (1–80 caracteres) e phone (10–15 dígitos). O e-mail institucional inicial vem da conta. Conta, instituição e vínculo OWNER são criados em uma transação; uma falha desfaz o conjunto. CNPJ tem unicidade, sem consulta cadastral ou validação de dígitos verificadores.

400 para entrada inválida; 409 para e-mail ou CNPJ já cadastrado. Restrições UNIQUE no PostgreSQL protegem também cadastros simultâneos.

## POST /api/auth/login

Público. Corpo: `{"email":"maria@example.test","password":"uma senha de exemplo"}`.

200: objeto com accessToken, tokenType Bearer, expiresIn 3600 e user no formato anterior. O frontend persiste token, usuário e prazo absoluto em localStorage (eventhub.session.v1) para restaurar o login por até uma hora. Não há refresh token ou renovação automática. Logout revoga o token no servidor e remove o cache local, sincronizando a saída nas demais abas da mesma origem.

401 e mensagem única para e-mail inexistente ou senha incorreta. 400 para formato inválido.

## GET /api/users/me

Authorization: Bearer TOKEN. Gateway e Identity verificam assinatura e claims. O Identity também verifica a versão da credencial e a revogação persistida no seu banco. Consulta o usuário pelo sub do token, não por um id fornecido pelo cliente.

200: `{"user":{...}}`. 401 para token ausente, inválido, expirado ou usuário inexistente.

## PATCH /api/users/me

Authorization: Bearer TOKEN. Corpo: `{"name":"Maria Atualizada"}`.

200 com user atualizado. name é obrigatório; cpf e phone são opcionais, com as regras do cadastro. Campos omitidos preservam seus valores. email, role, id e password são rejeitados neste endpoint. Não há consulta ou atualização pública por id.

## POST /api/users/me/password

Authorization: Bearer TOKEN. Corpo: currentPassword e newPassword, ambas com 8–128 caracteres. Verifica a senha atual, rejeita reutilização e grava um novo hash. A atualização compara o hash anterior para impedir que alterações concorrentes sobrescrevam uma senha mais recente.

200: mensagem de senha atualizada. 400 para senha atual incorreta ou nova senha igual; 409 para alteração concorrente. A mesma transação incrementa `users.credentials_version` e remove links de recuperação e confirmação de e-mail anteriores; todos os JWTs da conta passam a ser recusados imediatamente. O frontend encerra a sessão local após sucesso.

## Alteração e verificação de e-mail

`POST /api/users/me/email`, com Bearer, corpo `{"email":"novo@example.test","currentPassword":"senha atual de exemplo"}`, verifica a senha atual e agenda uma mensagem no novo endereço usando a mesma outbox/mailbox/SMTP da recuperação. 202 com `message`, sem token na resposta. O perfil e o login continuam usando o endereço antigo até a confirmação. Também aceita o endereço atual para verificar sua posse. Somente o pedido mais recente de cada usuário permanece válido.

400 para entrada inválida ou senha atual incorreta; 409 para endereço já ocupado ou credencial alterada durante a solicitação. O endereço é normalizado para minúsculas e limitado a 254 caracteres. O cliente não pode definir estado de verificação, versão de credencial ou prazo.

`POST /api/auth/email/confirm`, público, corpo `{"token":"64 caracteres hexadecimais"}`, retorna 204. Em uma transação, consome o token válido por 30 minutos, atualiza o endereço, registra `emailVerifiedAt`, incrementa a versão de credencial e remove links de recuperação e confirmação anteriores. Todos os JWTs anteriores passam a retornar 401; um novo login usa o endereço confirmado. Um token expirado, substituído, utilizado ou emitido antes de uma troca/reset de senha retorna 400. Se outra conta ocupar o endereço antes da confirmação, a restrição UNIQUE impede a troca e a API retorna 409, preservando os dados anteriores.

O link da mensagem é `/confirmar-email#token=...`. A tela visual de confirmação ainda não faz parte desta implementação de backend. Para consumir o link, o cliente lê o token do fragmento e envia o POST acima; o token deve permanecer no corpo da requisição, sem inclusão na URL da API. No modo mailbox, o arquivo é `/tmp/eventhub-mail/<sha256(novoEmail)>.json`, com o link na propriedade `path`. As rotas compartilham limite de 10 requisições por IP em 15 minutos e retornam `Cache-Control: no-store`.

## Remoção de membro da organização

`DELETE /api/organizations/:id/members/:userId`, com Bearer de um OWNER, retorna 204 após remover o vínculo ORGANIZER. A operação revalida o papel do autor dentro da transação. A conta do usuário permanece; suas próximas consultas à organização passam a retornar 404. O responsável pode adicionar o mesmo usuário novamente pelo POST de membros existente.

403 para um ORGANIZER tentando remover membros; 404 para organização não acessível ou membro inexistente; 409 `owner_protected` ao tentar remover o responsável, inclusive o próprio OWNER. Nenhuma remoção de proprietário ou transferência de titularidade é exposta por essa rota; o índice de proprietário único e a guarda transacional preservam o responsável.

## Sessões e logout

`GET /api/auth/session`, com Bearer, retorna `{"identity":{"sub":"uuid","role":"PARTICIPANT","iat":0,"exp":0,"jti":"uuid","sv":0,...}}`. Não renova o prazo do JWT.

`POST /api/auth/logout`, com Bearer, retorna 204 após persistir SHA-256 do token em `revoked_sessions`, com o prazo original de expiração. Revoga somente a sessão corrente; outras sessões permanecem válidas. Reutilizar um token revogado retorna 401, inclusive no endpoint de logout. Token completo e senha não são armazenados nessa tabela.

Uma falha no banco de sessões retorna 503, sem aceitar o JWT usando apenas a assinatura. JWT legado sem `sv` equivale à versão zero e conserva seu prazo original; a primeira troca/redefinição de senha também o invalida.

## Recuperação de senha

`POST /api/auth/password/forgot`, corpo `{"email":"maria@example.test"}`, retorna a mesma mensagem 202 para conta existente ou desconhecida. Para uma conta existente, grava o hash de um token aleatório de uso único e uma mensagem na outbox na mesma transação. Prazo: 30 minutos. O token não aparece na resposta HTTP nem nos logs.

`POST /api/auth/password/reset`, corpo `{"token":"64 caracteres hexadecimais","password":"nova senha de exemplo"}`, consome o token, altera a senha, incrementa a versão de credencial e remove todos os outros links da conta em uma transação. 400 para token inválido, expirado ou utilizado. Dois links concorrentes não podem sobrescrever a nova senha em sequência. Limite: 10 requisições de recuperação/redefinição por IP em 15 minutos.

`MAIL_MODE=mailbox` é o padrão acadêmico: mensagem em `/tmp/eventhub-mail/<sha256(email)>.json`, contendo o caminho `/redefinir-senha#token=...`, acessível somente no ambiente do serviço. `MAILBOX_DIRECTORY` permite alterar o diretório. Não existe endpoint público que exponha essa caixa.

Para entrega configurável, use `MAIL_MODE=smtp`, `SMTP_HOST`, `SMTP_PORT` (587 por padrão), `MAIL_FROM` e `PUBLIC_APP_URL` (origem pública usada no link). Opcionais: `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE=true` para TLS direto e `SMTP_STARTTLS=false` para desativar STARTTLS em ambientes locais controlados. Por padrão, conexão sem TLS direto exige STARTTLS. Nenhuma credencial externa acompanha o projeto.

O worker de recuperação consulta `mail_outbox` a cada 3 segundos. Somente após aceite SMTP registra `SENT`; falha mantém a mensagem pendente, com tentativa persistida, e após três falhas registra `FAILED`. A resposta HTTP não aguarda o servidor SMTP. No modo mailbox, tenta entrega local imediatamente e usa o mesmo worker para repetir falhas. O corpo que contém o link é removido da outbox após o sucesso.

## APIs internas

As rotas abaixo exigem `x-internal-key` correspondente a `INTERNAL_API_KEY`, retornam `Cache-Control: no-store` e não devem ser publicadas pelo Gateway:

- `POST /internal/auth/verify`, corpo `{"token":"JWT"}`, verifica assinatura, expiração e revogação e retorna `{"identity":{...}}`. 401 para token inválido/revogado e 503 para dependência indisponível. Permite que o Gateway rejeite sessões revogadas antes de encaminhar operações.
- `GET /internal/users/:id` retorna somente `{"user":{"id":"uuid","name":"Nome","email":"pessoa@example.test"}}`. 404 para usuário inexistente, 401 para credencial interna inválida. Usado pelo Notifications; não fornece hash, CPF ou telefone.

Notifications usa a mesma configuração `MAIL_MODE`/`SMTP_*`/`MAIL_FROM`, além de `IDENTITY_URL`, `REGISTRATIONS_URL` e `INTERNAL_API_KEY`. Obtém destinatário e dados da inscrição pelas APIs internas, sem consultar bancos de outros serviços. O modo mailbox grava `<messageId>.json` no diretório local. O consumer só marca `SENT` após entrega aceita, persiste tentativas malsucedidas, deduplica IDs já enviados e encaminha à fila `notifications.failed` após três falhas. SMTP oferece entrega com repetição possível se o processo cair entre o aceite do provedor e a gravação de `SENT`; o `Message-ID` permanece estável para a mesma mensagem.

## Erros e limites

Formato de erro: error, message (quando disponível) e requestId. O Gateway retorna 503 identity_unavailable se o Identity não responder em até 5 segundos. Entradas acima de 16 KiB retornam 413. JSON malformado retorna 400.

Cadastro, login e troca de senha compartilham limite de 30 requisições por IP a cada 15 minutos por instância Identity; 429 inclui Retry-After. O Gateway repassa o IP obtido do proxy confiável; somente o Nginx publica porta no host. O contador é em memória e não constitui limitação distribuída.

## JWT

RS256; issuer eventhub-identity; audience eventhub-api; claims sub (UUID do usuário), role PARTICIPANT, iat, exp, jti (UUID único por login) e sv (versão de credencial). Validade e idade máxima de uma hora no Identity e Gateway. Chave privada somente no Identity; pública no Identity e Gateway. Algoritmos diferentes são rejeitados. Tokens antigos mantêm a data de expiração original.

## Recorte

Inclui cadastro/login, perfil, troca/redefinição de senha, alteração/verificação de e-mail, revogação de sessão, remoção de membros e entrega configurável mailbox/SMTP. Organizações e vínculos estão em [organizations.md](organizations.md); não alteram o papel global do usuário. A interface de alteração/confirmação de e-mail permanece para integração posterior; os endpoints e a entrega estão implementados.

