/**
 * Process entry point.
 *
 * The Express app itself lives in `app.js` so tests can mount it without
 * binding a port or starting a database pool.
 */
import { env, verifyEnv } from './lib/env.js';
import app from './app.js';
import { refreshPlanOverrides } from './saas/planOverrides.js';

// Refuse to boot a production deployment with an insecure configuration.
verifyEnv();

// Load plan-limit overrides before serving traffic so the first request
// already reflects any admin-tuned pricing, not the shipped defaults.
await refreshPlanOverrides().catch((error) => {
  console.warn('Could not load plan_overrides (using shipped defaults):', error.message);
});

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
