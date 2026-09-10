/**
 * PM2 cluster config — for a VPS/dedicated server where you control the
 * process manager (skip this on managed/shared Node hosting, e.g. Hostinger's
 * own Node app panel, which runs `npm start` itself and does not expect PM2).
 *
 * Usage:  cd backend && pm2 start ecosystem.config.cjs
 * Scale down: set PM2_INSTANCES to a fixed number instead of 'max' if the
 * server also runs MySQL/Redis and needs cores left over for them.
 */
module.exports = {
  apps: [
    {
      name: 'cybermilo-api',
      script: 'src/server.js',
      instances: process.env.PM2_INSTANCES || 'max',
      exec_mode: 'cluster',
      max_memory_restart: '500M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
