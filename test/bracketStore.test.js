import test from 'node:test';
import assert from 'node:assert/strict';

import { validatePicks, validateKnockoutMeta, buildStoredPicks, extractBracketPayload } from '../src/js/bracketStore.js';

test('validatePicks keeps valid teams in order', () => {
  const result = validatePicks({ A: ['South Korea', 'Mexico', 'Czech Rep.', 'South Africa'] });
  assert.deepEqual(result.A, ['South Korea', 'Mexico', 'Czech Rep.', 'South Africa']);
});

test('validatePicks drops unknown teams and duplicates', () => {
  const result = validatePicks({ A: ['Mexico', 'Mexico', 'Atlantis', 'South Africa'] });
  assert.deepEqual(result.A, ['Mexico', 'South Africa']);
});

test('validatePicks rejects a team placed in the wrong group', () => {
  // Argentina belongs to Group J, not Group A.
  const result = validatePicks({ A: ['Argentina', 'Mexico'] });
  assert.deepEqual(result.A, ['Mexico']);
});

test('validatePicks caps a group at four entries', () => {
  const result = validatePicks({
    B: ['Canada', 'Switzerland', 'Qatar', 'Bosnia & Herz.', 'Canada'],
  });
  assert.equal(result.B.length, 4);
});

test('validatePicks ignores bad input and empty groups', () => {
  assert.deepEqual(validatePicks(null), {});
  assert.deepEqual(validatePicks('nope'), {});
  assert.deepEqual(validatePicks({ A: [] }), {});
});

test('validateKnockoutMeta keeps winners and third-place groups', () => {
  const meta = validateKnockoutMeta({
    winners: { M73: 'A', M104: 'B', bad: 'C', M999: 'A' },
    thirdGroups: ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'Z'],
  });
  assert.deepEqual(meta.winners, { M73: 'A', M104: 'B' });
  assert.deepEqual(meta.thirdGroups, ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
});

test('buildStoredPicks nests knockout meta under __knockout', () => {
  const stored = buildStoredPicks(
    { A: ['Mexico', 'South Africa'] },
    { winners: { M101: 'A' }, thirdGroups: ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] },
  );
  assert.deepEqual(stored.A, ['Mexico', 'South Africa']);
  assert.deepEqual(stored.__knockout.winners, { M101: 'A' });
  assert.equal(stored.__knockout.thirdGroups.length, 8);
});

test('extractBracketPayload splits group picks from knockout meta', () => {
  const { picks, knockout } = extractBracketPayload({
    A: ['Mexico', 'South Africa'],
    __knockout: { winners: { M97: 'B' }, thirdGroups: ['A', 'B'] },
  });
  assert.deepEqual(picks, { A: ['Mexico', 'South Africa'] });
  assert.deepEqual(knockout.winners, { M97: 'B' });
  assert.deepEqual(knockout.thirdGroups, ['A', 'B']);
});
