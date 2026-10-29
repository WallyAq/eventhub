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

RabbitMQ está provisionado com volume e healthcheck; publicação e consumo serão implementados na etapa de eventos assíncronos. Identity possui users, organizations e organization_members, com migrações versionadas no próprio serviço. Os demais serviços ainda possuem somente diagnóstico.

Os logs das aplicações incluem serviço, método, caminho, status, duração e requestId. O Nginx cria o identificador e o Gateway o repassa às consultas internas. Não são registrados corpos, senhas ou tokens.

## Serviços modelados para evolução

- Attendance: armazena presenças, identifica participante/atividade e impede check-ins duplicados. Dados pertencem ao futuro attendance_db.
- Certificate: emite certificados após término e presença válida, obtendo informações por APIs/eventos. Dados pertencem ao futuro certificate_db.
- Reporting: mantém projeções para relatórios sem consultar tabelas de outros domínios. Dados pertencem ao futuro reporting_db.

Esses três serviços não possuem containers ou bancos nesta etapa. A implementação é adiada para priorizar o fluxo obrigatório de inscrição e pagamento.

## Próximos limites importantes

Event possui a capacidade configurada. Registration deverá manter reservas e ocupação transacionalmente; não usará contagem de disponibilidade no frontend para decidir reservas. A sincronização de alterações de capacidade precisa de contrato antes da implementação.

Identity emite JWT RS256 para participantes. Gateway e Identity validam assinatura e claims; /users/me usa o sujeito autenticado. A chave privada fica apenas no Identity. Há cadastro/login públicos, perfil protegido e organizações com vínculos OWNER/ORGANIZER consultados no banco por operação. O vínculo não altera o papel global do JWT. A autorização de eventos será implementada no domínio Event, consumindo informações por API.

