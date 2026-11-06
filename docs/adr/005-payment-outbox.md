# ADR 005 — Conciliação de pagamento e outbox

Status: aceito para o protótipo.

Não há transação SQL entre bancos. Payment persiste a primeira intenção simulada como PENDING e chama um [provedor simulado separado](../api/payment-provider.md) por HTTP. Usa referência idempotente e banco próprio do simulador, valida sua resposta e então chama Registration. Uma linha única por inscrição impede transações duplicadas. Registration valida prazo com o relógio do banco sob lock. Payment conclui ou retoma a conciliação após falha. Callback repetido é seguro; aprovação tardia não reabre EXPIRED/CANCELLED. Transações legadas mantêm sua recuperação anterior.

Inscrição e outbox são gravadas na mesma transação local. Worker publica com confirmação RabbitMQ. Entrega é pelo menos uma vez; Notification deduplica UUIDs. Indisponibilidade da mensageria/notificação não desfaz confirmação. Fila durável e mensagens persistentes permitem recuperação; erros de consumo têm limite e fila de falhas.

Resultados de pagamento geram aviso explícito na outbox do Registration, deduplicado por inscrição. Alterações públicas/cancelamento geram uma outbox no Event; seu worker solicita fan-out idempotente ao Registration, que enfileira um aviso por usuário. A transação principal não chama SMTP nem Notification. Veja [notificações](../api/notifications.md).

Cancelamento de evento converge no Registration por consulta REST periódica e antes de operações individuais. Há intervalo até o próximo ciclo; falha de Event adia convergência e impede novas reservas/aprovações. Não se promete atomicidade global entre cancelamento e confirmação concorrentes. Programação, preços e capacidade publicados não são editados; mudanças de informações públicas usam a operação separada com aviso.

Custos: workers consultam bancos periodicamente; snapshots exigem conciliação. Protótipo não implementa cobrança/estorno real nem TLS interno. Revogação de sessão é consultada no Identity pelo Gateway. Credencial interna compartilhada fica na rede Docker; o simulador possui credencial própria, e identidades específicas para os demais serviços são evolução prevista.
