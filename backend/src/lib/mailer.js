/**
 * Outbound email.
 *
 * Optional by design: the app works without it (invites fall back to
 * returning a one-time temporary password in the API response, which is
 * what happened before this existed). Once every SMTP_* env var is set,
 * `sendMail` actually delivers, and callers stay unaware of the difference
 * — they just get `{ sent: boolean }` back and decide what to tell the user.
 *
 * The transporter is created once and reused (SMTP connection pooling),
 * not per-send — recreating it per email would reconnect and re-auth every
 * time under load.
 */
import nodemailer from 'nodemailer';
import { env, isSmtpConfigured } from './env.js';

let transporter = null;

function getTransporter() {
  if (!isSmtpConfigured) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure, // true = implicit TLS (465), false = STARTTLS (587)
    auth: { user: env.smtp.user, pass: env.smtp.password },
    pool: true,
    maxConnections: 3,
  });

  return transporter;
}

/**
 * Confirms the SMTP credentials actually work. Call this once at boot (or
 * from an admin "test connection" action) rather than on every send — it's
 * a full auth round trip, not free.
 */
export async function verifySmtpConnection() {
  const client = getTransporter();
  if (!client) return { ok: false, reason: 'SMTP is not configured (SMTP_HOST/SMTP_USER/SMTP_PASSWORD missing).' };

  try {
    await client.verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

/**
 * Low-level send. Never throws — a mail failure must not break the request
 * that triggered it (an invite still creates the account even if the email
 * bounces); callers get `{ sent, error }` and decide how to degrade.
 */
export async function sendMail({ to, subject, html, text }) {
  const client = getTransporter();
  if (!client) return { sent: false, error: 'smtp_not_configured' };

  try {
    await client.sendMail({
      from: `"${env.smtp.fromName}" <${env.smtp.fromEmail}>`,
      to,
      subject,
      html,
      text,
    });
    return { sent: true };
  } catch (error) {
    console.warn(`[mailer] send to ${to} failed:`, error.message);
    return { sent: false, error: error.message };
  }
}

const ROLE_LABELS = {
  institution_admin: 'Institution Admin',
  principal: 'Principal',
  teacher: 'Teacher',
  student: 'Student',
  parent: 'Parent',
  staff: 'Staff',
};

/** Shared shell so every transactional email looks like the same product. */
function emailShell(bodyHtml) {
  return `
    <div style="background:#eef1f6;padding:32px 16px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;">
        <tr>
          <td style="padding-bottom:24px;text-align:center;">
            <span style="font-size:20px;font-weight:800;color:#1b2333;">CyberMilo</span>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border-radius:20px;padding:32px;box-shadow:0 10px 30px rgba(27,35,51,0.08);">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding-top:20px;text-align:center;color:#7c889e;font-size:12px;">
            You are receiving this because an administrator added you to a CyberMilo institution.
          </td>
        </tr>
      </table>
    </div>
  `;
}

/**
 * Invite email: tells a newly created user their temporary password and
 * where to sign in. Sent once, right after the account is created — the
 * password is never emailed again after this.
 */
export async function sendInviteEmail({ to, firstName, institutionName, role, temporaryPassword }) {
  const loginUrl = `${env.appUrl.replace(/\/$/, '')}/login`;
  const roleLabel = ROLE_LABELS[role] || role;

  const html = emailShell(`
    <h1 style="margin:0 0 12px;font-size:22px;color:#1b2333;">Welcome to ${institutionName}</h1>
    <p style="margin:0 0 20px;color:#4a566d;font-size:15px;line-height:1.6;">
      Hi ${firstName}, an administrator has created a CyberMilo account for you as
      <strong>${roleLabel}</strong>. Use the temporary password below to sign in — you'll
      be asked to set your own on first login.
    </p>
    <table role="presentation" width="100%" style="margin:0 0 24px;">
      <tr>
        <td style="background:#eef1f6;border-radius:14px;padding:16px;text-align:center;">
          <span style="font-family:'SF Mono',Consolas,monospace;font-size:18px;letter-spacing:1px;color:#1b2333;font-weight:700;">
            ${temporaryPassword}
          </span>
        </td>
      </tr>
    </table>
    <table role="presentation" width="100%">
      <tr>
        <td style="text-align:center;">
          <a href="${loginUrl}"
             style="display:inline-block;background:#4059ad;color:#ffffff;text-decoration:none;
                    font-weight:700;font-size:14px;padding:12px 28px;border-radius:12px;">
            Sign in to CyberMilo
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:24px 0 0;color:#7c889e;font-size:13px;">
      Email: ${to}<br>
      If you weren't expecting this, you can ignore it — the account stays inactive
      until someone signs in with the password above.
    </p>
  `);

  const text = [
    `Welcome to ${institutionName}`,
    ``,
    `Hi ${firstName}, an administrator has created a CyberMilo account for you as ${roleLabel}.`,
    ``,
    `Email: ${to}`,
    `Temporary password: ${temporaryPassword}`,
    ``,
    `Sign in: ${loginUrl}`,
    `You'll be asked to set your own password on first login.`,
  ].join('\n');

  return sendMail({ to, subject: `You're invited to ${institutionName} on CyberMilo`, html, text });
}

export default { sendMail, sendInviteEmail, verifySmtpConnection };
