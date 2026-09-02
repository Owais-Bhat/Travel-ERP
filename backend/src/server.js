/**
 * Process entry point.
 *
 * The Express app itself lives in `app.js` so tests can mount it without
 * binding a port or starting a database pool.
 */
import { env, verifyEnv } from './lib/env.js';
import app from './app.js';

// Refuse to boot a production deployment with an insecure configuration.
verifyEnv();

const server = app.listen(env.port, () => {
  console.log(`CyberMilo API listening on http://localhost:${env.port} (${env.nodeEnv})`);
});

// Let in-flight requests finish before the process goes away.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  });
}

export default server;
