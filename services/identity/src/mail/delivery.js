import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

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
      const info = await smtp.sendMail({ from, to: message.to, subject: message.subject, text: message.text,
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
    text: `Recebemos uma solicitação para redefinir sua senha. Acesse ${base || ''}${path}\nEste link é de uso único e vale por 30 minutos. Se você não solicitou a alteração, ignore esta mensagem.` };
}

export function emailChangeMessage({ id, email, token }, env = process.env) {
  const path = '/confirmar-email#token=' + token;
  const base = env.PUBLIC_APP_URL?.replace(/\/$/, '');
  if ((env.MAIL_MODE || 'mailbox') === 'smtp' && (!base || !/^https?:\/\//.test(base)))
    throw new Error('PUBLIC_APP_URL is required for SMTP email confirmation');
  return { id, to: email, path, subject: 'Confirme seu endereço de e-mail no EventHub',
    text: `Confirme o endereço de acesso da sua conta em ${base || ''}${path}\nEste link é de uso único e vale por 30 minutos. Se você não solicitou a confirmação, ignore esta mensagem.` };
}
