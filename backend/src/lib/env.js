/**
 * Validated environment configuration.
 *
 * Fails fast at boot when a production deployment is missing something that
 * would otherwise fail silently (a default JWT secret, no DB password, an
 * unset CORS origin). Development gets warnings instead of a hard exit.
 */
import 'dotenv/config';

const INSECURE_JWT_SECRET = 'cybermilo-super-secret-key-change-me';

function list(value, fallback = []) {
  if (!value) return fallback;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function int(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 5000),
  isProduction: (process.env.NODE_ENV || 'development') === 'production',

  jwtSecret: process.env.JWT_SECRET || INSECURE_JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  allowedOrigins: list(process.env.FRONTEND_ORIGIN, ['http://localhost:5173']),

  mysql: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: int(process.env.MYSQL_PORT, 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'cybermilo',
    connectionLimit: int(process.env.MYSQL_POOL_SIZE, 10),
  },

  uploads: {
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxBytes: int(process.env.UPLOAD_MAX_BYTES, 10 * 1024 * 1024),
    publicBaseUrl: process.env.UPLOAD_PUBLIC_BASE_URL || '',
  },

  rateLimit: {
    windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: int(process.env.RATE_LIMIT_MAX, 600),
    authMax: int(process.env.RATE_LIMIT_AUTH_MAX, 20),
  },

  trustProxy: process.env.TRUST_PROXY || (process.env.NODE_ENV === 'production' ? '1' : false),
  logFormat: process.env.LOG_FORMAT || (process.env.NODE_ENV === 'production' ? 'combined' : 'dev'),

  // Absent by default — the API works without mail (invites fall back to
  // returning a one-time temporary password in the response) and only
  // sends email once every SMTP_* value below is actually set.
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: int(process.env.SMTP_PORT, 587),
    // Port 465 is implicit TLS; anything else (587, 25) starts plaintext
    // and upgrades via STARTTLS, which is what nodemailer's `secure: false`
    // actually means — it is not "insecure", it is "negotiate TLS after connecting".
    secure: int(process.env.SMTP_PORT, 587) === 465,
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    fromName: process.env.SMTP_FROM_NAME || 'CyberMilo',
    fromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || '',
  },

  // Used to build links inside emails (e.g. "sign in" / "reset password").
  // Falls back to the first allowed CORS origin, which is right for a
  // single-tenant-frontend deployment.
  appUrl: process.env.APP_URL || list(process.env.FRONTEND_ORIGIN, ['http://localhost:5173'])[0],
};

export const isSmtpConfigured = Boolean(
  env.smtp.host && env.smtp.user && env.smtp.password
);

/**
 * Check the config and either throw (production) or warn (development).
 * Returns the list of problems so callers/tests can inspect them.
 */
export function verifyEnv({ throwOnError = env.isProduction } = {}) {
  const problems = [];

  if (env.jwtSecret === INSECURE_JWT_SECRET) {
    problems.push('JWT_SECRET is unset and falling back to the public default. Set a long random value.');
  } else if (env.jwtSecret.length < 32) {
    problems.push('JWT_SECRET is shorter than 32 characters.');
  }

  if (!env.mysql.password) {
    problems.push('MYSQL_PASSWORD is empty.');
  }

  if (!process.env.FRONTEND_ORIGIN) {
    problems.push('FRONTEND_ORIGIN is unset — CORS will only allow http://localhost:5173.');
  }

  if (env.allowedOrigins.includes('*')) {
    problems.push('FRONTEND_ORIGIN contains "*", which disables CORS protection.');
  }

  if (problems.length > 0) {
    const message = `Environment problems:\n  - ${problems.join('\n  - ')}`;
    if (throwOnError) throw new Error(message);
    console.warn(`[env] ${message}`);
  }

  return problems;
}

export default env;
