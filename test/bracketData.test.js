import test from 'node:test';
import assert from 'node:assert/strict';

import { getTournamentGroups, getGroupOrder, getGroupTeamNames, renderBracket, randomPicks, ADVANCE_COUNT } from '../src/js/bracketData.js';

test('tournament groups include all 12 groups and four teams each', () => {
  const groups = getTournamentGroups();

  assert.equal(groups.length, 12);
  assert.equal(groups[0].code, 'A');
  assert.equal(groups[11].code, 'L');
  assert.equal(groups.every(group => group.teams.length === 4), true);
  assert.equal(groups.every(group => group.flags.length === 4), true);
});

test('group order is stable for the UI and bracket rendering', () => {
  const groups = getGroupOrder();

  assert.deepEqual(groups, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
});

test('group team-name lookup returns the four teams, or empty for unknown groups', () => {
  assert.deepEqual(getGroupTeamNames('A'), ['Mexico', 'South Africa', 'South Korea', 'Czech Rep.']);
  assert.deepEqual(getGroupTeamNames('ZZ'), []);
});

test('bracket renders clickable team controls for every group', () => {
  const html = renderBracket();

  assert.match(html, /Group A/);
  assert.match(html, /Group L/);
  assert.match(html, /Mexico/);
  assert.match(html, /Argentina/);
  assert.match(html, /group-card/);
  assert.match(html, /data-group="A"/);
  assert.match(html, /data-index="0"/);
});

test('bracket marks the top two ranked teams as advancing with rank badges', () => {
  const html = renderBracket({ A: ['South Korea', 'Mexico'] });

  assert.match(html, /is-advancing/);
  assert.match(html, /rank-badge">1</);
  assert.match(html, /rank-badge">2</);
});

test('randomPicks fills every group with exactly the advancing pair', () => {
  const picks = randomPicks();
  const codes = getGroupOrder();

  assert.equal(Object.keys(picks).length, codes.length);
  assert.equal(codes.every((code) => picks[code].length === ADVANCE_COUNT), true);
});

test('randomPicks only uses real teams from each group, with no duplicates', () => {
  const picks = randomPicks();

  for (const code of getGroupOrder()) {
    const valid = getGroupTeamNames(code);
    const chosen = picks[code];
    assert.equal(new Set(chosen).size, chosen.length); // no duplicates
    assert.equal(chosen.every((name) => valid.includes(name)), true);
  }
});

test('randomPicks is deterministic with an injected RNG', () => {
  // Fisher-Yates with rng()=0 rotates the first two teams to the front.
  const picks = randomPicks(() => 0);
  assert.deepEqual(picks.A, ['South Africa', 'South Korea']);
});

test('group card shows a per-group clear control only when that group has picks', () => {
  const empty = renderBracket();
  assert.equal(/data-clear-group/.test(empty), false);

  const withPick = renderBracket({ A: ['Mexico'] });
  assert.match(withPick, /data-clear-group="A"/);
  assert.equal(/data-clear-group="B"/.test(withPick), false); // untouched groups have none
});

test('export-mode render omits the per-group clear control even when groups have picks', () => {
  const withPick = renderBracket({ A: ['Mexico'] }, { showClearButtons: false });
  assert.equal(/data-clear-group/.test(withPick), false);
});
