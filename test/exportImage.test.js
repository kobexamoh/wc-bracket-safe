import test from 'node:test';
import assert from 'node:assert/strict';

import { screenshotFilename, personalizedTitle, personalizedFilename, officialBracketTitle, officialBracketFilename } from '../src/js/exportImage.js';

test('screenshotFilename zero-pads month and day', () => {
  assert.equal(screenshotFilename(new Date(2026, 0, 5)), 'wc-bracket-2026-01-05.png');
  assert.equal(screenshotFilename(new Date(2026, 11, 25)), 'wc-bracket-2026-12-25.png');
});

test('screenshotFilename defaults to today in the expected shape', () => {
  assert.match(screenshotFilename(), /^wc-bracket-\d{4}-\d{2}-\d{2}\.png$/);
});

test('personalizedTitle uses the name, with a neutral fallback when blank', () => {
  assert.equal(personalizedTitle('Kobe'), "Kobe's D+C World Cup Bracket");
  assert.equal(personalizedTitle('  Amoh  '), "Amoh's D+C World Cup Bracket");
  assert.equal(personalizedTitle('   '), 'My D+C World Cup Bracket');
  assert.equal(personalizedTitle(), 'My D+C World Cup Bracket');
});

test('personalizedFilename slugifies the name and prefixes the dated base', () => {
  assert.equal(personalizedFilename('amoh', new Date(2026, 5, 17)), 'amoh-wc-bracket-2026-06-17.png');
  assert.equal(personalizedFilename('Kobe Amoh', new Date(2026, 5, 17)), 'kobe-amoh-wc-bracket-2026-06-17.png');
  assert.equal(personalizedFilename('   ', new Date(2026, 5, 17)), 'wc-bracket-2026-06-17.png');
  assert.equal(personalizedFilename('', new Date(2026, 0, 5)), 'wc-bracket-2026-01-05.png');
});

test('officialBracketTitle uses the name, with a neutral fallback when blank', () => {
  assert.equal(officialBracketTitle('Kobe'), "Kobe's World Cup Finals Predictions");
  assert.equal(officialBracketTitle('   '), 'My World Cup Finals Predictions');
});

test('officialBracketFilename slugifies the name and prefixes the dated base', () => {
  assert.equal(officialBracketFilename('amoh', new Date(2026, 6, 6)), 'amoh-wc-finals-predictions-2026-07-06.png');
  assert.equal(officialBracketFilename('', new Date(2026, 6, 6)), 'wc-finals-predictions-2026-07-06.png');
});
