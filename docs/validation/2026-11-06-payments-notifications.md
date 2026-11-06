# RF07 e RF08 — pagamentos e notificações

## Implementação

- O Payment usa HTTP para consultar o novo provedor fictício `payment-provider`, executado em processo separado, com banco e credencial próprios. Aprovação, recusa e expiração são persistidas pelo provedor; não há cobrança real nem coleta de dados bancários.
- A intenção de pagamento é persistida antes da chamada externa. Idempotência, consulta da decisão original e reconciliação permitem recuperar falhas sem criar outra transação. Aprovação tardia não reabre reserva expirada/cancelada.
- Notification comunica explicitamente aprovação, recusa e expiração do pagamento. O aviso inclui valor, resultado e situação da inscrição, identificando a simulação acadêmica.
- Eventos publicados permitem editar título, descrição, local geral, plataforma e horário informativo em **Gestão → Configurações → Informações públicas e avisos**. Alteração efetiva e cancelamento do evento produzem avisos aos inscritos, uma vez por anúncio/pessoa mesmo com várias atividades.
- Alterações e mensagens são persistidas por outboxes transacionais. Notification indisponível não desfaz pagamento, inscrição ou alteração do evento. Retentativas e fila de falhas continuam disponíveis.
- SMTP possui configuração no Compose/`.env.example`, guia próprio e teste do protocolo por socket local. O ambiente permanece em `MAIL_MODE=mailbox`.

## Evidências executadas

- Provedor: 3 testes HTTP, incluindo autenticação, idempotência, conflito de dados, recusa e expiração.
- Payment: 7 testes, incluindo decisão do provedor diferente do cenário solicitado, resposta inconsistente, indisponibilidade e retomada da mesma transação.
- Gateway: 10 testes aprovados.
- Testes Python de recursos do organizador e RF07/RF08: 25 aprovados; Notification: 8 aprovados, incluindo SMTP real em `127.0.0.1` com destinatário sintético e assunto/corpo em UTF-8.
- Bootstrap: cópia limpa de `.env.example`, geração dos segredos necessários e segunda execução sem duplicar variáveis nem substituir credenciais existentes.
- Integração com Docker/PostgreSQL/RabbitMQ: `tests/integration/payments-notifications.test.mjs` aprovado. Valida aprovação/recusa/expiração, unicidade no banco do provedor, recuperação após desligar o provedor, operação principal com Notification desligado, entrega posterior, escopo do organizador, alterações públicas e cancelamento sem duplicar avisos por pessoa.
- Interface: 5 testes aprovados em `payments-notifications.spec.ts` e `organizer-management.spec.ts`, cobrindo salvamento/erro do novo formulário, aviso persistente após recarga, expiração no checkout e regressão da gestão. Captura em 390 px inspecionada, sem transbordamento horizontal. Build TypeScript/Vite e imagem Docker do frontend aprovados.
- Regressão de negócio: os seis cenários de concorrência, pagamento, expiração, recuperação de Notification e cancelamento passaram. O cenário adicional de recuperação de senha não encerrou verde nessa rodada: o Identity produziu `401` próximo do limite do Gateway, que respondeu `503` sob carga. A conferência isolada da mesma conta sintética passou: senha antiga recusada e nova senha aceita pelo Gateway. Esse timeout não foi ocultado nem usado para alterar o fluxo de autenticação nesta entrega.

Os testes de integração criam contas/eventos sintéticos `@example.test`. Os arquivos mailbox são conferidos somente para essas fixtures. Não foram enviados e-mails externos.

## Implantação e limites

Em um checkout atualizado, execute os comandos do [guia do provedor](../api/payment-provider.md). Eles acrescentam configuração/banco do simulador e atualizam os contêineres sem apagar volumes. Transações anteriores mantêm `providerMode=LEGACY`; novas transações usam `EXTERNAL_SIMULATOR`.

Para entrega real de e-mails, ainda é necessário preencher as credenciais do servidor escolhido e seguir o [guia SMTP](../deployment/smtp.md). A entrega externa não foi validada sem essas credenciais. Mailbox é evidência local da entrega acadêmica, sem caixa de notificações no frontend. SMTP oferece entrega pelo menos uma vez; uma queda após aceitação pelo servidor pode repetir o mesmo `Message-ID`.

Período, capacidade, preço e programação permanecem imutáveis depois da publicação. O novo formulário altera somente informações públicas gerais, sem mudar horários/locais específicos das atividades.
