/**
 * Vercel serverless handler: forwards bracket / email / login-help events to Slack.
 *
 * Secrets live ONLY in Vercel env vars (never in git or the browser bundle):
 * - SLACK_WEBHOOK_URL
 * - NOTIFY_WEBHOOK_SECRET  (Bearer token for Supabase + Resend webhooks)
 * - RESEND_WEBHOOK_SECRET  (Svix signing secret from Resend dashboard)
 * - NOTIFY_ALLOWED_ORIGINS (comma-separated; login-help CORS)
 */

import { Webhook } from 'svix';
import {
  checkRateLimit,
  formatSlackBracket,
  formatSlackEmailFailure,
  formatSlackLoginHelp,
  isAllowedOrigin,
  parseResendFailureEvent,
  parseSupabaseBracketEvent,
  postToSlack,
  sanitizeNotifyEmail,
  verifyBearerSecret,
} from '../lib/notifyUtils.js';

/** @type {Map<string, number[]>} */
const rateLimitStore = new Map();

const LOGIN_HELP_IP_LIMIT = { max: 8, windowMs: 60 * 60 * 1000 };
const LOGIN_HELP_EMAIL_LIMIT = { max: 2, windowMs: 60 * 60 * 1000 };

function readEnv(name) {
  return process.env[name] || '';
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function routeFromQuery(url) {
  try {
    const parsed = new URL(url, 'http://localhost');
    return parsed.searchParams.get('event') || '';
  } catch {
    return '';
  }
}

async function handleLoginHelp(req, res, body, now) {
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin, readEnv('NOTIFY_ALLOWED_ORIGINS'))) {
    json(res, 403, { ok: false, error: 'origin_not_allowed' });
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');

  let parsed;
  try {
    parsed = JSON.parse(body || '{}');
  } catch {
    json(res, 400, { ok: false, error: 'invalid_json' });
    return;
  }

  // Honeypot: bots that fill hidden fields get a silent OK (no Slack noise).
  if (parsed.website) {
    json(res, 200, { ok: true });
    return;
  }

  const email = sanitizeNotifyEmail(parsed.email);
  if (!email) {
    json(res, 400, { ok: false, error: 'invalid_email' });
    return;
  }

  const ip = getClientIp(req);
  const ipCheck = checkRateLimit(
    rateLimitStore,
    `login-help:ip:${ip}`,
    LOGIN_HELP_IP_LIMIT.max,
    LOGIN_HELP_IP_LIMIT.windowMs,
    now,
  );
  if (!ipCheck.allowed) {
    res.setHeader('Retry-After', String(ipCheck.retryAfterSec));
    json(res, 429, { ok: false, error: 'rate_limited' });
    return;
  }

  const emailCheck = checkRateLimit(
    rateLimitStore,
    `login-help:email:${email}`,
    LOGIN_HELP_EMAIL_LIMIT.max,
    LOGIN_HELP_EMAIL_LIMIT.windowMs,
    now,
  );
  if (!emailCheck.allowed) {
    res.setHeader('Retry-After', String(emailCheck.retryAfterSec));
    json(res, 429, { ok: false, error: 'rate_limited' });
    return;
  }

  await postToSlack(readEnv('SLACK_WEBHOOK_URL'), formatSlackLoginHelp({ email }));
  json(res, 200, { ok: true });
}

async function handleBracketWebhook(req, res, body) {
  const auth = req.headers.authorization;
  if (!verifyBearerSecret(auth, readEnv('NOTIFY_WEBHOOK_SECRET'))) {
    json(res, 401, { ok: false, error: 'unauthorized' });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(body || '{}');
  } catch {
    json(res, 400, { ok: false, error: 'invalid_json' });
    return;
  }

  const event = parseSupabaseBracketEvent(payload);
  if (!event) {
    json(res, 400, { ok: false, error: 'ignored_event' });
    return;
  }

  await postToSlack(readEnv('SLACK_WEBHOOK_URL'), formatSlackBracket(event));
  json(res, 200, { ok: true });
}

async function handleResendWebhook(req, res, rawBody) {
  const auth = req.headers.authorization;
  if (!verifyBearerSecret(auth, readEnv('NOTIFY_WEBHOOK_SECRET'))) {
    json(res, 401, { ok: false, error: 'unauthorized' });
    return;
  }

  const svixSecret = readEnv('RESEND_WEBHOOK_SECRET');
  if (!svixSecret) {
    json(res, 500, { ok: false, error: 'webhook_not_configured' });
    return;
  }

  let payload;
  try {
    const wh = new Webhook(svixSecret);
    payload = wh.verify(rawBody, {
      'svix-id': req.headers['svix-id'],
      'svix-timestamp': req.headers['svix-timestamp'],
      'svix-signature': req.headers['svix-signature'],
    });
  } catch {
    json(res, 401, { ok: false, error: 'invalid_signature' });
    return;
  }

  const event = parseResendFailureEvent(payload);
  if (!event) {
    json(res, 200, { ok: true, ignored: true });
    return;
  }

  await postToSlack(readEnv('SLACK_WEBHOOK_URL'), formatSlackEmailFailure(event));
  json(res, 200, { ok: true });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    if (isAllowedOrigin(origin, readEnv('NOTIFY_ALLOWED_ORIGINS'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Vary', 'Origin');
    }
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }

  if (!readEnv('SLACK_WEBHOOK_URL')) {
    json(res, 503, { ok: false, error: 'notifications_not_configured' });
    return;
  }

  const route = routeFromQuery(req.url || '');
  const rawBody = await readRawBody(req);
  const now = Date.now();

  try {
    if (route === 'login-help') {
      await handleLoginHelp(req, res, rawBody, now);
      return;
    }
    if (route === 'bracket') {
      await handleBracketWebhook(req, res, rawBody);
      return;
    }
    if (route === 'email') {
      await handleResendWebhook(req, res, rawBody);
      return;
    }
    json(res, 404, { ok: false, error: 'unknown_event' });
  } catch (err) {
    console.error('notify handler error:', err instanceof Error ? err.message : 'unknown');
    json(res, 500, { ok: false, error: 'internal_error' });
  }
}
