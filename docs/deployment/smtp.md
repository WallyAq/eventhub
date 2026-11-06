# Configurar entrega de e-mails por SMTP

O transporte está implementado tanto no Identity quanto no Notification. Por padrão, a demonstração usa mailbox local. Para enviar e-mails reais, configure no `.env` os dados fornecidos pelo administrador/provedor de e-mail; não envie as credenciais pelo chat nem as versione.

Exemplo para STARTTLS, geralmente na porta 587:

```dotenv
MAIL_MODE=smtp
MAIL_FROM=EventHub <eventos@seu-dominio.com>
SMTP_HOST=smtp.seu-provedor.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_STARTTLS=true
SMTP_USER=seu-usuario-smtp
SMTP_PASSWORD=sua-credencial-smtp
```

Para TLS desde a conexão, use a porta indicada pelo provedor (frequentemente 465) com `SMTP_SECURE=true`. O Notification usa validação de certificado TLS; não desabilite essa validação para contornar problemas de configuração. Alguns provedores exigem credencial de aplicação e remetente autorizado.

Depois de salvar a configuração:

```powershell
docker compose up -d --no-deps --force-recreate identity notifications
docker compose logs --tail 50 notifications
```

O endereço público dos links vem de `PUBLIC_APP_URL`. A confirmação/recuperação de conta é entregue pelo Identity; comunicações de inscrição, pagamento e evento são entregues pelo Notification. Os serviços compartilham as variáveis SMTP do Compose.

Para continuar com a entrega acadêmica local, mantenha `MAIL_MODE=mailbox`. Não é preciso informar credenciais SMTP nesse modo.

A validação automatizada inclui STARTTLS/autenticação com transporte controlado e uma sessão SMTP real por socket em `127.0.0.1`, com destinatários sintéticos `@example.test`. Isso valida o protocolo e a composição sem mandar mensagens externas. A entrega em um servidor externo só pode ser comprovada depois de informar suas configurações e credenciais reais e conferir uma mensagem recebida.
