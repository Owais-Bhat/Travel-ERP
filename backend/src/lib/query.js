/**
 * Query helpers for list endpoints: pagination, sorting, search and
 * tenant-scoped fetches.
 *
 * Sort columns are matched against an explicit allow-list because column
 * names cannot be parameterised — never pass user input straight through.
 */
import { ApiError } from './errors.js';

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 20;

export function parsePagination(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const requested = Number.parseInt(query.pageSize ?? query.limit, 10) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requested));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/**
 * @param {object} query   req.query
 * @param {string[]} allowed  sortable column names
 * @param {string} fallback   column used when none/invalid is supplied
 */
export function parseSort(query = {}, allowed = [], fallback = 'created_at') {
  const requested = String(query.sort || fallback);
  const column = allowed.includes(requested) ? requested : fallback;
  const direction = String(query.order || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return { column, direction, sql: `\`${column}\` ${direction}` };
}

/**
 * Build a WHERE clause from simple equality filters plus a LIKE search.
 * Returns `{ clause, params }` where clause already includes "WHERE".
 */
export function buildWhere({ equals = {}, search = null, searchColumns = [], raw = [], alias = null } = {}) {
  const conditions = [];
  const params = [];
  const col = (name) => (alias ? `${alias}.\`${name}\`` : `\`${name}\``);

  for (const [column, value] of Object.entries(equals)) {
    if (value === undefined || value === null || value === '') continue;
    conditions.push(`${col(column)} = ?`);
    params.push(value);
  }

  if (search && searchColumns.length > 0) {
    const like = `%${search}%`;
    const group = searchColumns.map((column) => `${col(column)} LIKE ?`).join(' OR ');
    conditions.push(`(${group})`);
    searchColumns.forEach(() => params.push(like));
  }

  for (const { sql, params: rawParams = [] } of raw) {
    if (!sql) continue;
    conditions.push(sql);
    params.push(...rawParams);
  }

  return {
    clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

/**
 * Run a paginated SELECT and return `{ data, pagination }`.
 * `LIMIT`/`OFFSET` are interpolated as validated integers because MySQL
 * refuses them as prepared-statement placeholders in some server versions.
 */
export async function paginatedQuery(db, {
  select,
  from,
  where = '',
  params = [],
  orderBy = '`created_at` DESC',
  page,
  pageSize,
  offset,
}) {
  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total FROM ${from} ${where}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);

  const limit = Number.parseInt(pageSize, 10);
  const skip = Number.parseInt(offset, 10);
  if (!Number.isInteger(limit) || !Number.isInteger(skip) || limit < 1 || skip < 0) {
    throw ApiError.badRequest('Invalid pagination parameters');
  }

  const [rows] = await db.query(
    `SELECT ${select} FROM ${from} ${where} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${skip}`,
    params
  );

  return {
    data: rows,
    pagination: {
      page,
      pageSize: limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

/** Fetch one tenant-owned row or throw 404. */
export async function findOwnedOrFail(db, table, id, institutionId, { columns = '*' } = {}) {
  const [rows] = await db.execute(
    `SELECT ${columns} FROM \`${table}\` WHERE id = ? AND institution_id = ? LIMIT 1`,
    [id, institutionId]
  );
  if (!rows[0]) throw ApiError.notFound('Record not found');
  return rows[0];
}

/**
 * Build an UPDATE from a whitelist of fields present in `body`.
 * Returns null when the payload contains nothing updatable.
 */
export function buildUpdate(body = {}, allowedFields = []) {
  const assignments = [];
  const params = [];

  for (const field of allowedFields) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    assignments.push(`\`${field}\` = ?`);
    params.push(body[field] === '' ? null : body[field]);
  }

  if (assignments.length === 0) return null;
  return { sql: assignments.join(', '), params };
}

/** Generate a per-tenant sequential document number, e.g. APP-2026-0007. */
export async function nextSequenceNo(db, { table, column, institutionId, prefix }) {
  const year = new Date().getFullYear();
  const stem = `${prefix}-${year}-`;
  const [rows] = await db.execute(
    `SELECT \`${column}\` AS value FROM \`${table}\`
      WHERE institution_id = ? AND \`${column}\` LIKE ?
      ORDER BY \`${column}\` DESC LIMIT 1`,
    [institutionId, `${stem}%`]
  );

  const last = rows[0]?.value;
  const lastSeq = last ? Number.parseInt(String(last).slice(stem.length), 10) : 0;
  const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
  return `${stem}${String(next).padStart(4, '0')}`;
}
