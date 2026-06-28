/**
 * Pure helpers for the /api/notify serverless handler.
 * Kept dependency-free so node:test can cover the logic without Vercel.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** @param {string} email */
export function sanitizeNotifyEmail(email) {
  if (typeof email !== 'string') return '';
  const normalized = email.trim().toLowerCase().slice(0, 254);
  if (/[<>"'\s]/.test(normalized)) return '';
  return EMAIL_RE.test(normalized) ? normalized : '';
}

/** @param {string | undefined} hostOrUrl */
export function originFromVercelHost(hostOrUrl) {
  if (!hostOrUrl || typeof hostOrUrl !== 'string') return '';
  const host = hostOrUrl.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  return host ? `https://${host}` : '';
}

/**
 * Vercel injects deployment + branch hostnames at runtime. Preview redeploys get a
 * new hash URL each time, so trusting these avoids whack-a-mole in NOTIFY_ALLOWED_ORIGINS.
 * @param {Record<string, string | undefined>} env
 */
export function vercelAutoOrigins(env) {
  const keys = ['VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL'];
  const origins = keys.map((key) => originFromVercelHost(env[key])).filter(Boolean);
  return [...new Set(origins)];
}

/** @param {string | undefined} origin @param {string | undefined} allowedCsv @param {string[]} [extraOrigins] */
export function isAllowedOrigin(origin, allowedCsv, extraOrigins = []) {
  if (!origin || typeof origin !== 'string') return false;
  const allowed = String(allowedCsv || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const all = [...allowed, ...extraOrigins];
  return all.includes(origin);
}

/** @param {string | undefined} headerValue @param {string | undefined} secret */
export function verifyBearerSecret(headerValue, secret) {
  if (!secret || typeof secret !== 'string') return false;
  const expected = `Bearer ${secret}`;
  if (typeof headerValue !== 'string') return false;
  if (headerValue.length !== expected.length) return false;
  // Constant-time compare without timing leaks on length mismatch above.
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= headerValue.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Sliding-window rate limit keyed by arbitrary strings (IP, email, etc.).
 * @param {Map<string, number[]>} store
 * @param {string} key
 * @param {number} maxHits
 * @param {number} windowMs
 * @param {number} now
 */
export function checkRateLimit(store, key, maxHits, windowMs, now) {
  if (!key) return { allowed: false, retryAfterSec: windowMs / 1000 };
  const windowStart = now - windowMs;
  const hits = (store.get(key) || []).filter((t) => t > windowStart);
  if (hits.length >= maxHits) {
    const oldest = hits[0] ?? now;
    const retryAfterSec = Math.ceil((oldest + windowMs - now) / 1000);
    return { allowed: false, retryAfterSec: Math.max(1, retryAfterSec) };
  }
  hits.push(now);
  store.set(key, hits);
  return { allowed: true, retryAfterSec: 0 };
}

/** @param {unknown} body */
export function parseSupabaseBracketEvent(body) {
  if (!body || typeof body !== 'object') return null;
  const record = /** @type {{ record?: Record<string, unknown>; type?: string; table?: string }} */ (body);
  if (record.table !== 'brackets') return null;
  if (record.type !== 'INSERT' && record.type !== 'UPDATE') return null;
  const row = record.record;
  if (!row || typeof row !== 'object') return null;
  const userId = typeof row.user_id === 'string' ? row.user_id : '';
  const updatedAt = typeof row.updated_at === 'string' ? row.updated_at : '';
  if (!userId) return null;
  return {
    action: record.type === 'INSERT' ? 'submitted' : 'updated',
    userId,
    updatedAt,
  };
}

/** @param {unknown} body */
export function parseResendFailureEvent(body) {
  if (!body || typeof body !== 'object') return null;
  const payload = /** @type {{ type?: string; data?: Record<string, unknown> }} */ (body);
  const type = payload.type || '';
  const failureTypes = new Set([
    'email.bounced',
    'email.complained',
    'email.delivery_delayed',
    'email.failed',
  ]);
  if (!failureTypes.has(type)) return null;
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  const toRaw = data.to;
  const recipients = Array.isArray(toRaw)
    ? toRaw.map((v) => sanitizeNotifyEmail(String(v))).filter(Boolean)
    : [sanitizeNotifyEmail(String(toRaw || ''))].filter(Boolean);
  return {
    eventType: type,
    recipients,
    subject: typeof data.subject === 'string' ? data.subject.slice(0, 200) : '',
  };
}

/** @param {{ email: string }} params */
export function formatSlackLoginHelp({ email }) {
  return {
    text: 'WC Bracket: login help requested',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*WC Bracket — login help requested*\nSomeone did not receive their magic-link email. Send them a fresh link manually if needed.',
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Email:*\n\`${email}\`` },
          { type: 'mrkdwn', text: '*Action:*\nCheck Supabase Auth + Resend logs; resend OTP if needed.' },
        ],
      },
    ],
  };
}

/** @param {{ action: string; userId: string; updatedAt: string }} params */
export function formatSlackBracket({ action, userId, updatedAt }) {
  const shortId = userId.length > 8 ? `${userId.slice(0, 8)}…` : userId;
  const verb = action === 'submitted' ? 'submitted' : 'updated';
  return {
    text: `WC Bracket: bracket ${verb}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*WC Bracket — bracket ${verb}*\nA signed-in user ${verb} their group-stage picks.`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*User id:*\n\`${shortId}\`` },
          { type: 'mrkdwn', text: `*Updated:*\n${updatedAt || 'unknown'}` },
        ],
      },
    ],
  };
}

/** @param {{ eventType: string; recipients: string[]; subject: string }} params */
export function formatSlackEmailFailure({ eventType, recipients, subject }) {
  const list = recipients.length ? recipients.map((e) => `\`${e}\``).join(', ') : 'unknown';
  return {
    text: 'WC Bracket: auth email delivery issue',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*WC Bracket — auth email delivery issue*\nResend reported a problem delivering a message (likely a magic link).',
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Event:*\n\`${eventType}\`` },
          { type: 'mrkdwn', text: `*Recipient(s):*\n${list}` },
          { type: 'mrkdwn', text: `*Subject:*\n${subject || 'n/a'}` },
        ],
      },
    ],
  };
}

/** @param {Record<string, unknown>} payload */
export async function postToSlack(webhookUrl, payload) {
  if (!webhookUrl) throw new Error('Slack webhook URL is not configured');
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Slack webhook failed (${res.status})${detail ? `: ${detail.slice(0, 120)}` : ''}`);
  }
}
