/**
 * Zod-backed request validation middleware.
 *
 * `validate({ body, query, params })` replaces the raw request values with
 * the parsed/coerced result, so handlers work with clean typed data and
 * unknown keys are stripped before they can reach a SQL builder.
 */
import { ApiError } from './errors.js';

function formatIssues(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

export function validate(schemas = {}) {
  return (req, res, next) => {
    for (const key of ['params', 'query', 'body']) {
      const schema = schemas[key];
      if (!schema) continue;

      const result = schema.safeParse(req[key]);
      if (!result.success) {
        return next(ApiError.unprocessable(`Invalid request ${key}`, {
          code: 'validation_error',
          details: formatIssues(result.error),
        }));
      }

      // req.query is a getter on Express 5; assign defensively.
      try {
        req[key] = result.data;
      } catch {
        Object.defineProperty(req, key, { value: result.data, writable: true, configurable: true });
      }
    }
    return next();
  };
}

export default validate;
