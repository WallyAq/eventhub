# ADR 005 — Conciliação de pagamento e outbox

Status: aceito para o protótipo.

Não há transação SQL entre bancos. Payment persiste a primeira decisão simulada como PENDING antes de chamar Registration. Uma linha única por inscrição impede transações duplicadas. Registration valida prazo com o relógio do banco sob lock. Payment conclui ou retoma a conciliação após falha. Callback repetido é seguro; aprovação tardia não reabre EXPIRED/CANCELLED.

Inscrição e outbox são gravadas na mesma transação local. Worker publica com confirmação RabbitMQ. Entrega é pelo menos uma vez; Notification deduplica UUIDs. Indisponibilidade da mensageria/notificação não desfaz confirmação. Fila durável e mensagens persistentes permitem recuperação; erros de consumo têm limite e fila de falhas.

Cancelamento de evento converge no Registration por consulta REST periódica e antes de operações individuais. Há intervalo até o próximo ciclo; falha de Event adia convergência e impede novas reservas/aprovações. Não se promete atomicidade global entre cancelamento e confirmação concorrentes. Conteúdo publicado não é editado, reduzindo tipos de eventos necessários.

Custos: workers consultam bancos periodicamente; snapshots exigem conciliação. Protótipo não implementa cobrança/estorno real, TLS interno ou revogação imediata de JWT. Credencial interna compartilhada fica na rede Docker; identidades específicas por serviço são evolução prevista.
