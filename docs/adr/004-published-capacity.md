# ADR 004 — Capacidade fixa após publicação e reservas serializadas

Status: aceito para o protótipo.

Event possui capacidade e preço configurados. Registration controla a ocupação. Para não introduzir um protocolo distribuído de alteração de lotação, eventos publicados ficam imutáveis, exceto cancelamento. Rascunhos podem ser editados e não recebem inscrições.

Registration copia dados da atividade para inventário/snapshot. Toda ocupação bloqueia a mesma linha de inventário com SELECT FOR UPDATE. Reservas pendentes e confirmações entram na contagem; índice parcial impede duplicação ativa por participante. Idempotency-Key e lock por usuário protegem repetições. A fila é promovida por created_at e id.

Isso simplifica a prova contra overbooking e funciona com múltiplas instâncias usando o mesmo banco. O lock limita vazão por atividade, aceitável no contexto acadêmico. Consultas escalam independentemente; alterar capacidade publicada exigirá novo contrato e testes.
