# RF08 — notificações de inscrição, pagamento e eventos

O Notification entrega as mensagens por mailbox local ou SMTP. O caminho principal de inscrição, pagamento e alteração do evento não chama SMTP e não depende da disponibilidade do consumidor.

## Comunicações

| Família | Tipos |
| --- | --- |
| Inscrição | `registration.reserved`, `registration.confirmed`, `registration.waitlisted`, `registration.expired`, `registration.cancelled` |
| Pagamento | `payment.approved`, `payment.declined`, `payment.expired` |
| Evento | `event.updated`, `event.cancelled` |

Mensagens de pagamento indicam valor, resultado, situação atual da inscrição e que nenhuma cobrança real ocorreu. Aprovação recebida após expiração/cancelamento informa explicitamente que não confirmou a vaga. O resultado é enfileirado na transação que aplica/verifica a decisão no Registration; uma restrição única por inscrição impede novo aviso de pagamento a cada callback repetido.

## Alterações relevantes do evento

Gestão → Configurações → **Informações públicas e avisos** permite atualizar título, descrição, local geral, plataforma e horário informativo de eventos publicados. A API é `PATCH /api/events/:id/public-information`, autorizada pela organização, com esses cinco campos (`title`, `description`, `location`, `streamUrl`, `sessionTime`). Retorna `{event,notificationsQueued}`. Enviar os mesmos valores não gera outro aviso. Período, capacidade, preço e programação das atividades não são alterados por essa operação; o editor completo continua restrito a rascunhos.

Cancelar um evento publicado também enfileira aviso específico; repetir o cancelamento não gera outro anúncio. O Event persiste a alteração e o anúncio na mesma transação em `event_notification_outbox`. Um worker encaminha o anúncio ao endpoint privado do Registration, que verifica o evento e grava os destinatários na própria outbox. Falhas mantêm o anúncio pendente para nova tentativa.

O Registration deduplica por anúncio e seleciona uma inscrição por pessoa, evitando vários e-mails para quem está em diversas atividades. Considera inscrições criadas até a data do anúncio e atualmente ativas; no cancelamento também considera as marcadas com `cancellationReason: EVENT_CANCELLED`, cobrindo a convergência do cancelamento. Reservas já expiradas ou inscrições canceladas pelo participante não são destinatárias. Um participante que sair antes do processamento pode deixar de receber o aviso.

Os avisos guardam a informação alterada naquele momento e mostram a situação atual da inscrição na composição. Não afirmam que uma inscrição antiga ainda está confirmada. A comunicação usa o canal escolhido na configuração; não há central de notificações dentro do frontend nesta entrega.

## Entrega e recuperação

A outbox do Registration publica no exchange `eventhub` com confirmação do RabbitMQ. Notification usa fila durável, confirma consumo após a entrega registrada, deduplica mensagens e encaminha falhas repetidas à `notifications.failed`. Reporting continua consumindo somente `registration.#`.

Mensagens possuem IDs estáveis nas retentativas. Entrega SMTP é pelo menos uma vez: uma queda depois da aceitação pelo SMTP e antes do commit pode repetir o e-mail com o mesmo `Message-ID`. Isso não repete pagamentos nem desfaz alterações de negócio. SMTP indisponível não reverte inscrição, pagamento ou alteração de evento já persistidos.

O modo padrão `MAIL_MODE=mailbox` escreve arquivos privados em `/tmp/eventhub-mail` no contêiner; não envia e-mail externo. Cada arquivo inclui tipo, destinatário, assunto e conteúdo para evidência acadêmica. A recriação do contêiner remove esses arquivos efêmeros, embora o histórico de entregas permaneça no banco. Para entrega real, consulte [configuração de SMTP](../deployment/smtp.md).
