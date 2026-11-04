import { createApp } from './app.js';
import { services } from './config/services.js';
import { createVerifier } from './security/tokens.js';
import { createSessionVerifier } from './security/sessions.js';

const verify = createSessionVerifier(await createVerifier(process.env.JWT_PUBLIC_KEY_BASE64), services.identity, process.env.INTERNAL_API_KEY);
const server = createApp(services, fetch, verify).listen(Number(process.env.PORT || 3000), '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
});

