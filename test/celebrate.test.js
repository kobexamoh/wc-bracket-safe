import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCelebrationBursts,
  prefersReducedMotion,
  readBrandColors,
  CELEBRATION_COLORS,
  CELEBRATION_Z_INDEX,
} from '../src/js/celebrate.js';

test('buildCelebrationBursts fires two side cannons (left x:0 + right x:1)', () => {
  const bursts = buildCelebrationBursts();
  assert.equal(bursts.length, 2);
  assert.equal(bursts[0].origin.x, 0); // from the left edge
  assert.equal(bursts[1].origin.x, 1); // from the right edge
  assert.equal(bursts[0].angle, 60); // angled up-and-inward
  assert.equal(bursts[1].angle, 120);
});

test('buildCelebrationBursts uses the brand palette and renders above the modal', () => {
  for (const burst of buildCelebrationBursts()) {
    assert.deepEqual(burst.colors, CELEBRATION_COLORS);
    assert.ok(burst.colors.includes('#007A33')); // UA green token
    assert.ok(burst.colors.includes('#F2CD00')); // UA gold token
    assert.equal(burst.zIndex, CELEBRATION_Z_INDEX);
    assert.ok(burst.zIndex >= 300); // above .modal (z-index 300)
    assert.equal(burst.disableForReducedMotion, true);
  }
});

test('buildCelebrationBursts accepts custom colors', () => {
  const colors = ['#111111', '#222222'];
  const bursts = buildCelebrationBursts({ colors });
  assert.deepEqual(bursts[0].colors, colors);
  assert.deepEqual(bursts[1].colors, colors);
});

test('prefersReducedMotion reflects the media query and is safe without a window', () => {
  const reduced = { matchMedia: () => ({ matches: true }) };
  const normal = { matchMedia: () => ({ matches: false }) };
  assert.equal(prefersReducedMotion(reduced), true);
  assert.equal(prefersReducedMotion(normal), false);
  assert.equal(prefersReducedMotion(undefined), false); // no DOM -> no motion claim
});

test('readBrandColors falls back to the constant palette without a document', () => {
  assert.deepEqual(readBrandColors(undefined), CELEBRATION_COLORS);
});
