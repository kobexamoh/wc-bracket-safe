import test from 'node:test';
import assert from 'node:assert/strict';

import { screenshotFilename } from '../src/js/exportImage.js';

test('screenshotFilename zero-pads month and day', () => {
  assert.equal(screenshotFilename(new Date(2026, 0, 5)), 'wc-bracket-2026-01-05.png');
  assert.equal(screenshotFilename(new Date(2026, 11, 25)), 'wc-bracket-2026-12-25.png');
});

test('screenshotFilename defaults to today in the expected shape', () => {
  assert.match(screenshotFilename(), /^wc-bracket-\d{4}-\d{2}-\d{2}\.png$/);
});
