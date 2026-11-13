import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function formatMessage({ title, introduction, action, url, disclaimer }) {
  const validity = 'Este link é de uso único e expira em 30 minutos.';
  return {
    text: ['EVENTHUB', 'Olá!', title, introduction, `${action}:\n${url}`, validity, disclaimer, 'Equipe EventHub'].join('\n\n'),
    html: `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F2FD;font-family:Arial,Helvetica,sans-serif;color:#1F2437">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#FFFFFF;border:1px solid #DDD9F7;border-radius:12px">
<tr><td bgcolor="#5B4BDB" style="padding:24px 32px;border-radius:12px 12px 0 0;color:#FFFFFF;font-size:22px;font-weight:bold;letter-spacing:1px">EVENTHUB</td></tr>
<tr><td style="padding:32px">
<h1 style="margin:0 0 24px;font-size:26px;line-height:1.3">${escapeHtml(title)}</h1>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6">Olá!</p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.6">${escapeHtml(introduction)}</p>
<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0"><tr><td bgcolor="#5B4BDB" style="border-radius:6px">
<a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 24px;color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:bold">${escapeHtml(action)}</a>
</td></tr></table>
<p style="margin:0 0 24px;padding:16px;background:#F3F2FD;border-left:3px solid #5B4BDB;font-size:14px;line-height:1.6">${validity}</p>
<p style="margin:0 0 8px;font-size:13px;color:#6B7280">Se o botão não funcionar, copie e cole este link no navegador:</p>
<p style="margin:0 0 24px;font-size:13px;line-height:1.6;word-break:break-all"><a href="${escapeHtml(url)}" style="color:#5B4BDB">${escapeHtml(url)}</a></p>
<p style="margin:0;padding-top:20px;border-top:1px solid #DDD9F7;font-size:14px;line-height:1.6;color:#6B7280">${escapeHtml(disclaimer)}</p>
<p style="margin:24px 0 0;font-size:14px;line-height:1.6">Equipe EventHub</p>
</td></tr></table></td></tr></table></body></html>`,
  };
}

export function createMailDelivery(env = process.env, { transport } = {}) {
  const mode = env.MAIL_MODE || 'mailbox';
  if (!['mailbox', 'smtp'].includes(mode)) throw new Error('MAIL_MODE must be mailbox or smtp');
  const from = env.MAIL_FROM || 'EventHub <no-reply@eventhub.local>';
  const port = Number(env.SMTP_PORT || 587);
  if (mode === 'smtp' && (!env.SMTP_HOST || !Number.isInteger(port) || port < 1 || port > 65535 || !env.MAIL_FROM))
    throw new Error('SMTP_HOST, SMTP_PORT and MAIL_FROM are required for SMTP');
  let smtp = transport;
  return {
    async send(message) {
      if (mode === 'mailbox') {
        const directory = env.MAILBOX_DIRECTORY || '/tmp/eventhub-mail';
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const filename = createHash('sha256').update(message.to).digest('hex') + '.json';
        await writeFile(directory + '/' + filename, JSON.stringify({ ...message, expiresInMinutes: 30 }), { mode: 0o600 });
        return;
      }
      smtp ??= (await import('nodemailer')).default.createTransport({
        host: env.SMTP_HOST, port, secure: env.SMTP_SECURE === 'true',
        requireTLS: env.SMTP_STARTTLS !== 'false' && env.SMTP_SECURE !== 'true',
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD || '' } : undefined,
        connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
      });
      const info = await smtp.sendMail({ from, to: message.to, subject: message.subject, text: message.text, html: message.html,
        messageId: `<${message.id}@eventhub.local>` });
      if (!Array.isArray(info.accepted) || !info.accepted.length || info.rejected?.length)
        throw new Error('SMTP did not accept the recipient');
    },
  };
}

export function recoveryMessage({ id, email, token }, env = process.env) {
  const path = '/redefinir-senha#token=' + token;
  const base = env.PUBLIC_APP_URL?.replace(/\/$/, '');
  if ((env.MAIL_MODE || 'mailbox') === 'smtp' && (!base || !/^https?:\/\//.test(base)))
    throw new Error('PUBLIC_APP_URL is required for SMTP recovery');
  return { id, to: email, path, subject: 'Redefina sua senha no EventHub',
    ...formatMessage({ title: 'Redefina sua senha',
      introduction: 'Recebemos uma solicitação para redefinir a senha da sua conta no EventHub. Use o botão abaixo para escolher uma nova senha.',
      action: 'Redefinir minha senha', url: `${base || ''}${path}`,
      disclaimer: 'Se você não solicitou esta alteração, ignore esta mensagem. Sua senha continuará a mesma.' }) };
}

export function emailChangeMessage({ id, email, token }, env = process.env) {
  const path = '/confirmar-email#token=' + token;
  const base = env.PUBLIC_APP_URL?.replace(/\/$/, '');
  if ((env.MAIL_MODE || 'mailbox') === 'smtp' && (!base || !/^https?:\/\//.test(base)))
    throw new Error('PUBLIC_APP_URL is required for SMTP email confirmation');
  return { id, to: email, path, subject: 'Confirme seu endereço de e-mail no EventHub',
    ...formatMessage({ title: 'Confirme seu novo e-mail',
      introduction: 'Recebemos uma solicitação para usar este endereço de e-mail na sua conta do EventHub. Confirme abaixo para concluir a alteração.',
      action: 'Confirmar meu e-mail', url: `${base || ''}${path}`,
      disclaimer: 'Se você não solicitou esta alteração, ignore esta mensagem. Seu endereço de acesso só muda após a confirmação.' }) };
}
