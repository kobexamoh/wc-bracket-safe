import test from 'node:test';
import assert from 'node:assert/strict';

import { validatePicks } from '../src/js/bracketStore.js';

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
