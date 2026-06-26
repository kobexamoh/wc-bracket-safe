import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { getTournamentGroups, getAllFlagCodes } from '../src/js/bracketData.js';

const here = dirname(fileURLToPath(import.meta.url));
const flagsDir = join(here, '..', 'public', 'flags');

// ISO 3166-1 alpha-2 (e.g. "mx"), or an ISO 3166-2 subdivision (e.g. "gb-sct").
const CODE_RE = /^[a-z]{2}(-[a-z]{3})?$/;

test('every team resolves to a valid flag code', () => {
  for (const group of getTournamentGroups()) {
    for (const team of group.teams) {
      assert.ok(team.code, `${team.name} has no flag code`);
      assert.match(team.code, CODE_RE, `${team.name} -> "${team.code}" is not a valid code`);
    }
  }
});

test('getAllFlagCodes returns one distinct code per team (48)', () => {
  const codes = getAllFlagCodes();
  assert.equal(codes.length, 48);
  assert.equal(new Set(codes).size, 48); // all 48 teams are distinct countries here
});

test('England and Scotland use ISO 3166-2 subdivision codes (the Windows-broken cases)', () => {
  const byName = new Map();
  for (const group of getTournamentGroups()) {
    for (const team of group.teams) byName.set(team.name, team.code);
  }
  assert.equal(byName.get('England'), 'gb-eng');
  assert.equal(byName.get('Scotland'), 'gb-sct');
});

test('a flag SVG exists on disk for every code', () => {
  for (const code of getAllFlagCodes()) {
    assert.ok(existsSync(join(flagsDir, `${code}.svg`)), `missing public/flags/${code}.svg`);
  }
});
