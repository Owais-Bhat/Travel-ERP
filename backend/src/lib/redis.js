/**
 * Optional shared store for rate limiting across more than one process.
 *
 * A single instance is fine with the in-memory limiter — this only matters
 * once the app runs as multiple PM2 workers or multiple servers behind a
 * load balancer, where each process would otherwise keep its own separate
 * counters and the limit would stop meaning anything. Stays `null` (and
 * every caller falls back to in-memory) until REDIS_URL is set.
 */
import { env } from './env.js';

let client = null;

if (env.redisUrl) {
  const { default: Redis } = await import('ioredis');
  client = new Redis(env.redisUrl, {
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });
  client.on('error', (error) => {
    console.warn('[redis] connection error — rate limiting falls back to in-memory for affected requests:', error.message);
  });
  client.on('connect', () => console.log('[redis] connected — rate limiting is now shared across processes'));
}

export const redisClient = client;
