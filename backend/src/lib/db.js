import mysql from 'mysql2/promise';
import { env } from './env.js';

const pool = mysql.createPool({
  host: env.mysql.host,
  port: env.mysql.port,
  user: env.mysql.user,
  password: env.mysql.password,
  database: env.mysql.database,
  waitForConnections: true,
  connectionLimit: env.mysql.connectionLimit,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  // Return DATE/DATETIME/TIMESTAMP as plain strings (e.g. "2026-07-12"),
  // not JS Date objects — avoids server-timezone shifting the date by a
  // day when serialized to JSON (Date always serializes to UTC).
  dateStrings: true,
  // Prepared statements are cached per connection; cap it so a long-lived
  // pool does not accumulate statements for every ad-hoc query shape.
  maxPreparedStatements: 200,
});

/**
 * mysql2 throws on an `undefined` bind parameter rather than treating it as
 * SQL NULL. Optional validated fields arrive as `undefined` when the caller
 * omits them, which would turn every optional column into a 500. Normalise
 * once here so every route — and every future route — gets the SQL semantic
 * that "absent" means NULL.
 *
 * Nested arrays are handled too, for bulk `INSERT ... VALUES ?`.
 */
function normalizeParams(params) {
  if (!Array.isArray(params)) return params;
  return params.map((value) => {
    if (value === undefined) return null;
    if (Array.isArray(value)) return value.map((inner) => (inner === undefined ? null : inner));
    return value;
  });
}

/** Wrap a pool or connection so its execute/query normalise parameters. */
function withNormalisedParams(target) {
  return new Proxy(target, {
    get(object, property, receiver) {
      if (property === 'execute' || property === 'query') {
        return (sql, params, ...rest) => object[property](sql, normalizeParams(params), ...rest);
      }
      if (property === 'getConnection') {
        return async (...args) => withNormalisedParams(await object.getConnection(...args));
      }
      const value = Reflect.get(object, property, receiver);
      return typeof value === 'function' ? value.bind(object) : value;
    },
  });
}

const db = withNormalisedParams(pool);

/** Cheap connectivity probe used by /health. */
export async function pingDatabase() {
  const connection = await db.getConnection();
  try {
    await connection.query('SELECT 1');
    return true;
  } finally {
    connection.release();
  }
}

/** Run a function inside a transaction, rolling back on any throw. */
export async function withTransaction(handler) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await handler(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export default db;
