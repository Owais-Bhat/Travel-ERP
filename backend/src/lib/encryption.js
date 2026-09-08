/**
 * At-rest encryption for tenant-supplied secrets (Razorpay key_secret, etc.)
 * stored in the institutions.settings JSON column, which otherwise has no
 * encryption of its own. AES-256-GCM, keyed by ENCRYPTION_KEY (32-byte hex).
 */
import crypto from 'node:crypto';
import { env } from './env.js';

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const hex = env.encryptionKey;
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be set to a 32-byte hex string (64 hex chars) — see backend/.env.example.');
  }
  return Buffer.from(hex, 'hex');
}

/** Returns `{ iv, ciphertext, tag }` (all hex strings) for a plaintext string. */
export function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString('hex'), ciphertext: ciphertext.toString('hex'), tag: tag.toString('hex') };
}

/** Reverses `encrypt`. Throws if the payload is missing/corrupt/tampered. */
export function decrypt({ iv, ciphertext, tag }) {
  if (!iv || !ciphertext || !tag) throw new Error('Incomplete encrypted payload.');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'hex')), decipher.final()]);
  return plaintext.toString('utf8');
}
