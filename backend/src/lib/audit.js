/**
 * Activity-log writer.
 *
 * Rewritten for MySQL — the previous version still wrote through the Supabase
 * admin client, so every audit event was silently dropped after the MySQL
 * migration.
 *
 * Audit failures never break the request that triggered them: a lost log line
 * is worse than nothing, but a 500 on a successful write is worse still.
 */
import db from './db.js';

function getRequestIp(req) {
  const forwardedFor = req?.headers?.['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }
  return req?.ip || req?.socket?.remoteAddress || null;
}

export async function recordAuditEvent(req, {
  institutionId,
  action,
  description = null,
  entityType = null,
  entityId = null,
  severity = 'info',
  metadata = {},
}) {
  // institutionId is null for platform-level actions (announcements, plan
  // limit edits, super-admin team changes) that aren't tied to one tenant.
  if (!action) return null;

  try {
    const payload = {
      actor_profile_id: req?.auth?.profile?.id || null,
      actor_role: req?.auth?.profile?.role || null,
      ...metadata,
    };

    const [result] = await db.execute(
      `INSERT INTO activity_log
         (institution_id, user_id, action, description, entity_type, entity_id,
          severity, ip_address, user_agent, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        institutionId,
        req?.auth?.user?.id || null,
        action,
        description,
        entityType,
        entityId,
        severity,
        getRequestIp(req),
        (req?.headers?.['user-agent'] || null)?.slice(0, 500) || null,
        JSON.stringify(payload),
      ]
    );
    return result;
  } catch (error) {
    console.warn('recordAuditEvent failed:', error.message);
    return null;
  }
}

export default recordAuditEvent;
