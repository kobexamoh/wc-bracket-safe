import test from 'node:test';
import assert from 'node:assert/strict';

import { isOtpCooldownActive, formatCooldownSeconds } from '../src/js/authUtils.js';

test('cooldown reports active when requests are too close together', () => {
  const now = 120_000;

  assert.equal(isOtpCooldownActive(now - 30_000, now), true);
  assert.equal(isOtpCooldownActive(now - 90_000, now), false);
});

test('cooldown formatter returns the remaining seconds', () => {
  const now = 120_000;

  assert.equal(formatCooldownSeconds(now - 30_000, now), 30);
  assert.equal(formatCooldownSeconds(now - 5_000, now), 55);
});
