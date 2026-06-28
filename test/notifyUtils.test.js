import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkRateLimit,
  formatSlackBracket,
  formatSlackEmailFailure,
  formatSlackLoginHelp,
  isAllowedOrigin,
  parseResendFailureEvent,
  parseSupabaseBracketEvent,
  sanitizeNotifyEmail,
  verifyBearerSecret,
} from '../lib/notifyUtils.js';

describe('sanitizeNotifyEmail', () => {
  it('normalizes valid emails', () => {
    assert.equal(sanitizeNotifyEmail('  User@Example.COM '), 'user@example.com');
  });

  it('rejects invalid emails', () => {
    assert.equal(sanitizeNotifyEmail('not-an-email'), '');
    assert.equal(sanitizeNotifyEmail('<script>@x.com'), '');
  });
});

describe('verifyBearerSecret', () => {
  it('accepts a matching bearer token', () => {
    assert.equal(verifyBearerSecret('Bearer secret-token', 'secret-token'), true);
  });

  it('rejects missing or wrong tokens', () => {
    assert.equal(verifyBearerSecret('Bearer wrong', 'secret-token'), false);
    assert.equal(verifyBearerSecret(undefined, 'secret-token'), false);
  });
});

describe('isAllowedOrigin', () => {
  it('matches an allow-listed origin', () => {
    const list = 'https://wc.example.com,http://localhost:3000';
    assert.equal(isAllowedOrigin('https://wc.example.com', list), true);
    assert.equal(isAllowedOrigin('https://evil.example.com', list), false);
  });
});

describe('checkRateLimit', () => {
  it('allows up to max hits then blocks', () => {
    const store = new Map();
    const now = 1_000_000;
    const first = checkRateLimit(store, 'ip:1', 2, 60_000, now);
    const second = checkRateLimit(store, 'ip:1', 2, 60_000, now + 1);
    const third = checkRateLimit(store, 'ip:1', 2, 60_000, now + 2);
    assert.equal(first.allowed, true);
    assert.equal(second.allowed, true);
    assert.equal(third.allowed, false);
    assert.ok(third.retryAfterSec >= 1);
  });
});

describe('parseSupabaseBracketEvent', () => {
  it('parses insert and update on brackets', () => {
    const insert = parseSupabaseBracketEvent({
      type: 'INSERT',
      table: 'brackets',
      record: { user_id: 'abc-123', updated_at: '2026-06-27T12:00:00Z' },
    });
    assert.deepEqual(insert, {
      action: 'submitted',
      userId: 'abc-123',
      updatedAt: '2026-06-27T12:00:00Z',
    });

    const update = parseSupabaseBracketEvent({
      type: 'UPDATE',
      table: 'brackets',
      record: { user_id: 'abc-123', updated_at: '2026-06-27T13:00:00Z' },
    });
    assert.equal(update?.action, 'updated');
  });

  it('ignores unrelated tables', () => {
    assert.equal(parseSupabaseBracketEvent({ type: 'INSERT', table: 'other' }), null);
  });
});

describe('parseResendFailureEvent', () => {
  it('parses bounce events with recipients', () => {
    const event = parseResendFailureEvent({
      type: 'email.bounced',
      data: { to: ['bad@example.com'], subject: 'Sign in' },
    });
    assert.equal(event?.eventType, 'email.bounced');
    assert.deepEqual(event?.recipients, ['bad@example.com']);
    assert.equal(event?.subject, 'Sign in');
  });

  it('ignores successful delivery events', () => {
    assert.equal(parseResendFailureEvent({ type: 'email.delivered', data: {} }), null);
  });
});

describe('Slack formatters', () => {
  it('formats login help without HTML injection', () => {
    const payload = formatSlackLoginHelp({ email: 'user@example.com' });
    assert.match(payload.text, /login help/i);
    assert.match(JSON.stringify(payload), /user@example.com/);
  });

  it('formats bracket events with a truncated user id', () => {
    const payload = formatSlackBracket({
      action: 'submitted',
      userId: '12345678-abcd',
      updatedAt: '2026-06-27T12:00:00Z',
    });
    assert.match(JSON.stringify(payload), /12345678…/);
  });

  it('formats email failure events', () => {
    const payload = formatSlackEmailFailure({
      eventType: 'email.bounced',
      recipients: ['a@b.com'],
      subject: 'Magic Link',
    });
    assert.match(payload.text, /delivery issue/i);
  });
});
