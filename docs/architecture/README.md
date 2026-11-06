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
| Attendance | Python / FastAPI | attendance_db | attendance_user |
| Certificate | Python / FastAPI | certificate_db | certificate_user |
| Reporting | Python / FastAPI | reporting_db | reporting_user |

O Gateway usa Node.js/Express e não possui banco. Somente Nginx publica porta no host. Um PostgreSQL mantém oito bancos lógicos de domínio e um banco adicional do provedor fictício, sem isolamento físico. Cada usuário é proprietário de seu banco; CONNECT público é revogado nos oito bancos de serviço. O administrador é usado apenas na infraestrutura. A provisão idempotente adiciona domínios a volumes existentes sem apagar dados.

RabbitMQ recebe eventos da outbox do Registration e entrega ao consumidor Notification, com deduplicação e fila de falhas. Identity possui contas, organizações e recuperação; Event possui programação; Registration possui inventário, inscrições e outbox; Payment possui transações simuladas; Notification possui entregas por mailbox ou SMTP. O provedor fictício é uma dependência HTTP separada do Payment, com banco e credencial próprios, sem porta publicada. Cada serviço cria tabelas usando apenas seu banco.

Os logs das aplicações incluem serviço, método, caminho, status, duração e requestId. O Nginx cria o identificador e o Gateway o repassa às consultas internas. Não são registrados corpos, senhas ou tokens.

## Presença, certificados e relatórios

- Attendance: registra presença autorizada pela organização e impede duplicidade por inscrição. O período de registro vai do início da atividade até 24 horas depois de seu término. Dados pertencem ao attendance_db.
- Certificate: emite e baixa PDF após término, presença e inscrição confirmada; consulta APIs, mantém snapshot e verifica o estado atual ao validar/baixar. QR Code aponta para consulta pública por código aleatório, sem CPF/e-mail. Dados pertencem ao certificate_db. O hash do registro não representa assinatura ICP-Brasil.
- Reporting: mantém projeções próprias e deduplica eventos RabbitMQ; reconcilia snapshots paginados via APIs para relatórios e exportação. Não consulta SQL de outro domínio. Dados pertencem ao reporting_db.

Os três serviços possuem contêiner, migração, saúde e contratos. O pagamento permanece simulado no escopo acadêmico. Notificações e recuperação aceitam mailbox local ou SMTP configurado; os padrões locais não enviam mensagens externas.

## Próximos limites importantes

Event possui capacidade e preços fixos após publicação. Registration mantém reservas sob lock transacional por atividade. Frontend não decide disponibilidade. Veja [ADR 004](../adr/004-published-capacity.md) e [ADR 005](../adr/005-payment-outbox.md).

Identity emite JWT RS256 com identificador de sessão e versão de credencial; Gateway consulta revogação no Identity e falha fechado se estiver indisponível. Logout revoga o token; alteração/reset de senha e confirmação de e-mail invalidam sessões anteriores. Event consulta vínculos por API; Registration e demais domínios validam conta, propriedade e organização. Vínculos não alteram o papel global do JWT. Callbacks internos exigem credencial interna e não são publicados no Gateway. A credencial interna compartilhada é restrita à rede Docker; identidades específicas por serviço permanecem uma evolução de implantação pública.

