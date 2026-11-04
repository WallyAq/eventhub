import { createPool } from './database/pool.js';
import { createApp } from './app.js';
import { migrate } from './database/migrate.js';
import { createTokens } from './security/tokens.js';
import { createUserRepository } from './users/repository.js';
import { createUserService } from './users/service.js';
import { createOrganizationRepository } from './organizations/repository.js';
import { createOrganizationService } from './organizations/service.js';
import { createSessions } from './security/sessions.js';
import { createMailDelivery, recoveryMessage } from './mail/delivery.js';
import { createMailOutbox } from './mail/outbox.js';

const pool = createPool();
await migrate(pool);
const tokens = await createTokens(process.env.JWT_PRIVATE_KEY_BASE64, process.env.JWT_PUBLIC_KEY_BASE64, createSessions(pool));
const mailOutbox = createMailOutbox(pool, createMailDelivery());
// Validate the public recovery origin at startup when SMTP is enabled.
if (process.env.MAIL_MODE === 'smtp') recoveryMessage({ id: '', email: '', token: '' });
const service = createUserService(createUserRepository(pool), tokens);
const organizations = createOrganizationService(createOrganizationRepository(pool));
const server = createApp(pool, { service, tokens, organizations, mailOutbox }).listen(Number(process.env.PORT || 3000), '0.0.0.0');
const stopMail = mailOutbox.start();
async function shutdown() {
  stopMail();
  server.close(async () => { await pool.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

