/**
 * Reusable zod building blocks.
 *
 * Everything that reaches MySQL goes through one of these, so empty strings
 * become NULL, numbers arrive as numbers, and enums stay inside the values
 * the schema actually stores.
 */
import { z } from 'zod';

/** Treat "" and "null" from HTML forms as absent. */
const emptyToNull = (value) => (value === '' || value === 'null' || value === undefined ? null : value);

export const uuid = z.string().uuid('Must be a valid UUID');
export const optionalUuid = z.preprocess(emptyToNull, uuid.nullable().optional());

export const shortText = (max = 255) => z.string().trim().min(1, 'Required').max(max);
export const optionalText = (max = 255) =>
  z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());
export const longText = z.preprocess(emptyToNull, z.string().trim().max(20000).nullable().optional());

export const email = z.preprocess(emptyToNull, z.string().trim().email('Invalid email').max(255).nullable().optional());
export const requiredEmail = z.string().trim().email('Invalid email').max(255);
export const phone = z.preprocess(
  emptyToNull,
  z.string().trim().min(6, 'Too short').max(30).regex(/^[+()\-\s\d]+$/, 'Invalid phone number').nullable().optional()
);

export const isoDate = z.preprocess(
  emptyToNull,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullable().optional()
);
export const isoDateTime = z.preprocess(
  emptyToNull,
  z.union([z.string().datetime({ offset: true }), z.string().regex(/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/)])
    .nullable()
    .optional()
);

export const money = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? undefined : Number(value)),
  z.number().min(0, 'Cannot be negative').max(9999999999, 'Too large')
);
export const optionalMoney = money.optional();

export const percentage = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? undefined : Number(value)),
  z.number().min(0).max(100)
);

export const count = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? undefined : Number(value)),
  z.number().int().min(0)
);

export const boolish = z.preprocess(
  (value) => {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === 1 || value === '1') return true;
    if (value === 'false' || value === 0 || value === '0') return false;
    return value;
  },
  z.boolean()
);

/** Standard list-endpoint query string. */
export const listQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  sort: z.string().max(60).optional(),
  order: z.enum(['asc', 'desc', 'ASC', 'DESC']).optional(),
  search: z.string().trim().max(120).optional(),
}).passthrough();

export const idParam = z.object({ id: uuid });

/** Enum helper that keeps the DB default when the field is omitted. */
export const enumWithDefault = (values, fallback) =>
  z.enum(values).optional().default(fallback);

/**
 * Build the body schema for a partial update from a create schema.
 *
 * `schema.partial()` alone is not safe here: zod keeps `.default()` on a
 * field even when it is made optional, so a PATCH that mentions none of the
 * defaulted fields still parses to `{ status: 'active' }` — and the update
 * silently resets that column. Stripping the defaults keeps an omitted field
 * genuinely omitted, so `buildUpdate` leaves the column alone.
 */
export function partialUpdate(schema) {
  const shape = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    shape[key] = typeof field.removeDefault === 'function'
      ? field.removeDefault().optional()
      : field.optional();
  }
  return z.object(shape);
}

export { z };
