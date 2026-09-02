/**
 * Document upload handling.
 *
 * Files land in a per-tenant subdirectory under UPLOAD_DIR with a
 * server-generated name, so a hostile filename cannot traverse the path or
 * overwrite anything. The original name is kept only as metadata in the DB.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { env } from './env.js';
import { ApiError } from './errors.js';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const EXTENSION_BY_MIME = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};

export const uploadsRoot = path.resolve(process.cwd(), env.uploads.dir);

const storage = multer.diskStorage({
  destination(req, file, callback) {
    // Tenant id comes from the authenticated session, never from the request body.
    const tenant = String(req.institutionId || 'shared').replace(/[^a-zA-Z0-9-]/g, '');
    const dir = path.join(uploadsRoot, tenant);
    fs.mkdir(dir, { recursive: true }, (error) => callback(error, dir));
  },
  filename(req, file, callback) {
    const extension = EXTENSION_BY_MIME[file.mimetype] || '';
    callback(null, `${crypto.randomUUID()}${extension}`);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: env.uploads.maxBytes,
    files: 1,
  },
  fileFilter(req, file, callback) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return callback(ApiError.badRequest(
        `Unsupported file type "${file.mimetype}". Allowed: PDF, JPG, PNG, WEBP, DOC(X), XLS(X).`
      ));
    }
    return callback(null, true);
  },
});

/** Public URL for a stored file, honouring UPLOAD_PUBLIC_BASE_URL behind a CDN. */
export function publicUrlFor(file, institutionId) {
  const tenant = String(institutionId || 'shared').replace(/[^a-zA-Z0-9-]/g, '');
  const relative = `/uploads/${tenant}/${path.basename(file.filename)}`;
  return env.uploads.publicBaseUrl
    ? `${env.uploads.publicBaseUrl.replace(/\/$/, '')}${relative}`
    : relative;
}

/** Best-effort delete used when a DB insert fails after the file landed. */
export async function removeStoredFile(file) {
  if (!file?.path) return;
  try {
    await fs.promises.unlink(file.path);
  } catch {
    // Already gone, or never written — nothing to clean up.
  }
}

/** Translate multer's own errors into ApiErrors. */
// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
export function uploadErrorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(ApiError.badRequest(
        `File is larger than the ${Math.round(env.uploads.maxBytes / 1024 / 1024)}MB limit.`
      ));
    }
    return next(ApiError.badRequest(err.message));
  }
  return next(err);
}
