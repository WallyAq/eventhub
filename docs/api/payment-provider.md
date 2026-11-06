# RF07 — provedor externo simulado

O Payment do EventHub chama por HTTP o processo separado `payment-provider`, com banco próprio `provider_db`. Ele representa um provedor externo fictício; não recebe dados bancários e não realiza cobranças. A API não é publicada pelo Gateway/Nginx e usa `PAYMENT_PROVIDER_API_KEY`, diferente da credencial interna dos domínios.

## Contrato do provedor

Todas as rotas `/v1` exigem `Authorization: Bearer <chave do provedor>`.

- `POST /v1/payments`, com `Idempotency-Key` igual a `reference`: `{reference: UUID da inscrição, amountCents: inteiro positivo, currency: "BRL", expiresAt: ISO com fuso, simulation: {outcome: "APPROVED"|"DECLINED"|"EXPIRED"}}`.
- Retorna `{payment: {id, reference, amountCents, currency, status, expiresAt, createdAt, simulated:true}}`, `201` na criação e `200` na repetição equivalente.
- `GET /v1/payments/:id` consulta a decisão original persistida.
- `GET /health` e `/ready` verificam processo e banco próprio.

Uma referência possui somente uma transação. Repetir a referência com outro preço, cenário, moeda ou prazo retorna `409`. O provedor decide `EXPIRED` se o prazo já terminou, mesmo quando o cenário solicitado era de aprovação. Repetições preservam a decisão e a data iniciais. Nome, CPF, e-mail e JWT do participante não são enviados ao provedor.

## Orquestração pelo Payment

A API pública `POST /api/payments/:registrationId` continua recebendo somente `outcome`, como cenário da demonstração, agora incluindo `EXPIRED`. O preço e o prazo vêm da reserva autorizada. O Payment persiste a intenção `PENDING`, chama o provedor, valida referência/preço/moeda/prazo/identificador e usa **o resultado recebido do provedor** para solicitar a transição ao Registration.

A resposta pública inclui `providerMode: "EXTERNAL_SIMULATOR"`, `providerPaymentId` e `providerStatus`. Um `202` mantém a transação pendente quando a dependência está indisponível. A consulta e o worker retomam a mesma transação: referências idempotentes cobrem inclusive a perda da resposta de criação do provedor. Nenhuma indisponibilidade gera confirmação fictícia.

O Registration continua decidindo se a reserva ainda pode confirmar, sob seu bloqueio e relógio do banco. Aprovação tardia não reabre inscrição expirada/cancelada. `providerStatus` pode ser `APPROVED` enquanto o resultado final é `EXPIRED`, indicando que a aprovação simulada não pôde ser aplicada à reserva.

Transações anteriores à migração conservam `providerMode: "LEGACY"` e suas regras de recuperação originais. As novas transações sempre usam o simulador externo. Não há reaplicação de cobranças antigas.

## Implantação

```powershell
node scripts/init-backend-config.mjs
docker compose up -d --wait postgres
node scripts/provision-backend-databases.mjs
docker compose up -d --build payment-provider payments registrations events notifications gateway frontend
```

O script gera somente segredos ausentes e preserva os existentes; a provisão acrescenta o banco/usuário do simulador sem apagar volumes ou alterar senhas já cadastradas. O Compose fornece `PAYMENT_PROVIDER_URL=http://payment-provider:3000` somente ao Payment.

Testes: `npm --prefix services/payment-provider test`, `npm --prefix services/payments test` e `node --test tests/integration/payments-notifications.test.mjs`. A integração para temporariamente o simulador e Notification, restaurando-os em `finally`; execute em ambiente de teste.
