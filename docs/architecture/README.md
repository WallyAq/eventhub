# Arquitetura inicial

Fluxo local: navegador → Nginx (localhost:8080) → React ou Gateway → aplicações → banco próprio.

Acesso externo planejado: Internet → Cloudflare Tunnel no host → Nginx.

| Aplicação | Tecnologia | Banco | Usuário |
| --- | --- | --- | --- |
| Identity | Node.js / Express | identity_db | identity_user |
| Event | Python / FastAPI | event_db | event_user |
| Registration | Python / FastAPI | registration_db | registration_user |
| Payment | Node.js / Express | payment_db | payment_user |
| Notification | Python / FastAPI | notification_db | notification_user |

O Gateway usa Node.js/Express e não possui banco. Somente Nginx publica porta no host. Um PostgreSQL mantém cinco bancos lógicos, sem isolamento físico. Cada usuário é proprietário de seu banco; CONNECT público é revogado nos cinco bancos de serviço. O administrador é usado apenas na infraestrutura.

RabbitMQ recebe eventos da outbox do Registration e entrega ao consumidor Notification, com deduplicação e fila de falhas. Identity possui contas, organizações e recuperação; Event possui programação; Registration possui inventário, inscrições e outbox; Payment possui transações simuladas; Notification possui entregas simuladas. Cada serviço cria tabelas usando apenas seu banco.

Os logs das aplicações incluem serviço, método, caminho, status, duração e requestId. O Nginx cria o identificador e o Gateway o repassa às consultas internas. Não são registrados corpos, senhas ou tokens.

## Serviços modelados para evolução

- Attendance: armazena presenças, identifica participante/atividade e impede check-ins duplicados. Dados pertencem ao futuro attendance_db.
- Certificate: emite certificados após término e presença válida, obtendo informações por APIs/eventos. Dados pertencem ao futuro certificate_db.
- Reporting: mantém projeções para relatórios sem consultar tabelas de outros domínios. Dados pertencem ao futuro reporting_db.

Esses três serviços não possuem containers ou bancos nesta etapa. A implementação é adiada para priorizar o fluxo obrigatório de inscrição e pagamento.

## Próximos limites importantes

Event possui capacidade e preços fixos após publicação. Registration mantém reservas sob lock transacional por atividade. Frontend não decide disponibilidade. Veja [ADR 004](../adr/004-published-capacity.md) e [ADR 005](../adr/005-payment-outbox.md).

Identity emite JWT RS256; Gateway e Identity validam assinatura/claims. Event consulta vínculos por API; Registration e Payment validam conta e proprietário da operação. Vínculos não alteram papel global do JWT. Callbacks internos exigem credencial interna e não são publicados no Gateway.

