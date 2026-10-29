import { createPool } from './database/pool.js';
import { createApp } from './app.js';
import { migrate } from './database/migrate.js';
import { createTokens } from './security/tokens.js';
import { createUserRepository } from './users/repository.js';
import { createUserService } from './users/service.js';
import { createOrganizationRepository } from './organizations/repository.js';
import { createOrganizationService } from './organizations/service.js';

const pool = createPool();
const tokens = await createTokens(process.env.JWT_PRIVATE_KEY_BASE64, process.env.JWT_PUBLIC_KEY_BASE64);
await migrate(pool);
const service = createUserService(createUserRepository(pool), tokens);
const organizations = createOrganizationService(createOrganizationRepository(pool));
const server = createApp(pool, { service, tokens, organizations }).listen(Number(process.env.PORT || 3000), '0.0.0.0');
async function shutdown() {
  server.close(async () => { await pool.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

