# RQ06 — rastrear uma inscrição

O Gateway, os oito serviços e o provedor fictício escrevem logs JSON com `service`, `requestId` e `correlationId`. Os registros HTTP também contêm método, caminho, status e duração; os workers registram identificadores de inscrição/mensagem e o resultado do processamento, sem corpo, e-mail, JWT, senha ou credenciais SMTP. Certificate mascara o código público de verificação no caminho.

- `X-Request-ID` identifica a operação HTTP. Nginx gera esse identificador na borda; chamadas internas o preservam.
- `X-Correlation-ID` liga a operação à cadeia de negócio. A borda aceita apenas letras, números e hífens, com até 64 caracteres; valores ausentes ou inválidos são substituídos. Os serviços repetem essa validação.
- Registration grava `correlationId` no snapshot da inscrição. Essa origem permanece nas mensagens de reserva, confirmação, expiração, cancelamento e pagamento. Novas requisições de pagamento recuperam a origem da inscrição; a tentativa HTTP conserva seu `requestId` próprio.
- Payment guarda essa correlação antes de chamar o provedor. O worker usa o valor persistido, inclusive depois de reinício/indisponibilidade. O provedor recebe os identificadores pelos cabeçalhos, sem dados pessoais.
- As outboxes guardam `correlationId` e `requestId` no payload. RabbitMQ recebe `correlation_id`, `message_id` e cabeçalhos de correlação. Notification e Reporting restauram o contexto antes de consultar dependências e processar a mensagem. Reenvios e fila de falhas preservam esses metadados.
- Event grava a origem no anúncio de alteração/cancelamento e a propaga pelo encaminhamento privado e pelas mensagens aos destinatários. Esse anúncio tem sua própria cadeia; as mensagens de estado de cada inscrição mantêm a cadeia original da inscrição.
- Inscrições/transações antigas sem metadados usam o UUID da inscrição como origem estável. Mensagens antigas continuam aceitas; não é necessário apagar bancos ou republicar dados.

Python utiliza `ContextVar`, propagado ao pool de threads do FastAPI; cada consumidor cria/restaura um escopo por mensagem. Payment usa `AsyncLocalStorage`. Requisições concorrentes não compartilham o contexto.

Identity também conserva o contexto HTTP na sua outbox de recuperação/verificação de conta, permitindo relacionar tentativas de entrega ao pedido original sem registrar endereço ou link. SMTP do Notification inclui `X-Correlation-ID` no cabeçalho da mensagem, quando disponível.

## Consulta local

```powershell
node scripts/trace-registration.mjs UUID-DA-INSCRICAO --since 30m
```

O comando exige acesso operacional ao Docker local. Consulta apenas a origem no banco do Registration, por meio do próprio serviço, e filtra os logs dos componentes. Não lê nem exibe o `.env`.

Também é possível enviar um `X-Correlation-ID` válido ao criar uma inscrição e procurar esse valor nos logs. As respostas incluem os cabeçalhos de rastreabilidade; a inscrição e o pagamento incluem sua correlação persistida no JSON.

Os logs locais seguem a retenção do Docker: recriar/remover contêineres pode apagar o histórico. Esse recurso fornece correlação estruturada, sem afirmar a existência de armazenamento centralizado, tracing distribuído OpenTelemetry ou métricas de desempenho que não foram implementados.

Validação: `tests/unit/test_observability.py`, `services/payments/test/trace.test.js` e `tests/integration/observability.test.mjs`. A integração força indisponibilidade do provedor, deixa o worker retomar o pagamento e verifica a origem nos logs, nas outboxes e nas entregas dos consumidores reais.
