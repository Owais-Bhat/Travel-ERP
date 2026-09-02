/**
 * Error plumbing shared by every route.
 *
 * Routes throw `ApiError`s (or let a driver error bubble) and the central
 * handler turns them into a consistent JSON shape. Nothing leaks a stack
 * trace or a raw SQL message to the client in production.
 */
import { env } from './env.js';

export class ApiError extends Error {
  constructor(status, message, { code = null, details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = true;
  }

  static badRequest(message = 'Bad request', options) { return new ApiError(400, message, options); }
  static unauthorized(message = 'Authentication required', options) { return new ApiError(401, message, options); }
  static forbidden(message = 'You do not have access to this resource', options) { return new ApiError(403, message, options); }
  static notFound(message = 'Resource not found', options) { return new ApiError(404, message, options); }
  static conflict(message = 'Conflict', options) { return new ApiError(409, message, options); }
  static unprocessable(message = 'Validation failed', options) { return new ApiError(422, message, options); }
}

/** Wrap an async route handler so rejected promises reach the error handler. */
export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/** Map MySQL driver errors onto meaningful HTTP statuses. */
function translateDriverError(error) {
  switch (error.code) {
    case 'ER_DUP_ENTRY':
      return new ApiError(409, 'That record already exists.', { code: 'duplicate' });
    case 'ER_NO_REFERENCED_ROW':
    case 'ER_NO_REFERENCED_ROW_2':
      return new ApiError(400, 'A referenced record does not exist.', { code: 'invalid_reference' });
    case 'ER_ROW_IS_REFERENCED':
    case 'ER_ROW_IS_REFERENCED_2':
      return new ApiError(409, 'This record is still referenced by other records.', { code: 'in_use' });
    case 'ER_DATA_TOO_LONG':
      return new ApiError(400, 'A field exceeds its maximum length.', { code: 'too_long' });
    case 'ECONNREFUSED':
    case 'PROTOCOL_CONNECTION_LOST':
      return new ApiError(503, 'Database is unavailable. Try again shortly.', { code: 'db_unavailable' });
    default:
      return null;
  }
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
}

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
export function errorHandler(err, req, res, next) {
  const translated = err instanceof ApiError ? err : translateDriverError(err);
  const error = translated || err;
  const status = error.status || error.statusCode || 500;

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }

  const body = {
    error: status >= 500 && env.isProduction
      ? 'Internal server error'
      : error.message || 'Internal server error',
  };

  if (error.code) body.code = error.code;
  if (error.details) body.details = error.details;
  if (!env.isProduction && status >= 500) body.stack = err.stack;

  res.status(status).json(body);
}
