import test from 'node:test';
import assert from 'node:assert/strict';

import { getTournamentGroups, getGroupOrder, getGroupTeamNames, renderBracket, randomPicks, fillBlankRanks, randomizeGroups, MAX_RANK } from '../src/js/bracketData.js';

test('tournament groups include all 12 groups and four teams each', () => {
  const groups = getTournamentGroups();

  assert.equal(groups.length, 12);
  assert.equal(groups[0].code, 'A');
  assert.equal(groups[11].code, 'L');
  assert.equal(groups.every(group => group.teams.length === 4), true);
  assert.equal(groups.every(group => group.flags.length === 4), true);
  assert.equal(groups.every(group => group.codes.length === 4), true);
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

test('team rows render self-hosted image flags (incl. UK subdivisions), not emoji', () => {
  const html = renderBracket();

  assert.match(html, /<img class="team-flag" src="\/flags\/mx\.svg" alt="" width="20" height="15">/);
  assert.match(html, /src="\/flags\/gb-eng\.svg"/); // England
  assert.match(html, /src="\/flags\/gb-sct\.svg"/); // Scotland
  const flagImgs = html.match(/class="team-flag"/g) || [];
  assert.equal(flagImgs.length, 48); // 12 groups x 4 teams, all images
});

test('export render uses PNG flags (html2canvas-safe on every engine, incl. iOS WebKit)', () => {
  const html = renderBracket({}, { flagExt: 'png' });

  assert.match(html, /src="\/flags\/mx\.png"/);
  assert.match(html, /src="\/flags\/gb-eng\.png"/); // England subdivision
  assert.equal(/\/flags\/[a-z-]+\.svg/.test(html), false); // no .svg srcs in export mode
});

test('bracket marks the top two ranked teams as advancing with rank badges', () => {
  const html = renderBracket({ A: ['South Korea', 'Mexico'] });

  assert.match(html, /is-advancing/);
  assert.match(html, /rank-badge">1</);
  assert.match(html, /rank-badge">2</);
});

test('randomPicks fills every group with the full four-team order', () => {
  const picks = randomPicks();
  const codes = getGroupOrder();

  assert.equal(Object.keys(picks).length, codes.length);
  assert.equal(codes.every((code) => picks[code].length === MAX_RANK), true);
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
  // Fisher-Yates with rng()=0 walks each team to the front in turn, leaving a fixed order.
  const picks = randomPicks(() => 0);
  assert.deepEqual(picks.A, ['South Africa', 'South Korea', 'Czech Rep.', 'Mexico']);
});

test('fillBlankRanks keeps placed teams and completes the group to four', () => {
  // Group A teams: Mexico, South Africa, South Korea, Czech Rep.
  const out = fillBlankRanks({ A: ['Mexico'] }, () => 0);

  assert.equal(out.A[0], 'Mexico');             // placed team keeps 1st
  assert.equal(out.A.length, MAX_RANK);         // completed to four
  assert.equal(new Set(out.A).size, MAX_RANK);  // no duplicates
  assert.equal(out.A.every((t) => getGroupTeamNames('A').includes(t)), true);
});

test('fillBlankRanks fills a fully-empty group with all four', () => {
  const out = fillBlankRanks({}, () => 0);
  assert.equal(getGroupOrder().every((code) => out[code].length === MAX_RANK), true);
});

test('fillBlankRanks leaves a complete group unchanged (new ref, equal value)', () => {
  const complete = ['South Korea', 'Mexico', 'Czech Rep.', 'South Africa'];
  const out = fillBlankRanks({ A: complete }, () => 0);
  assert.deepEqual(out.A, complete);
  assert.notEqual(out.A, complete); // copied, not mutated
});

test('fillBlankRanks is deterministic with an injected RNG', () => {
  const out = fillBlankRanks({ A: ['Mexico'] }, () => 0);
  assert.deepEqual(out.A, ['Mexico', 'South Korea', 'Czech Rep.', 'South Africa']);
});

test('randomizeGroups re-rolls only the chosen groups and preserves the rest', () => {
  const existing = { A: ['Mexico'], B: ['Canada', 'Qatar'] };
  const out = randomizeGroups(existing, ['A'], () => 0);

  assert.equal(out.A.length, MAX_RANK);         // A re-rolled to a full order
  assert.deepEqual(out.B, ['Canada', 'Qatar']); // B untouched
  assert.notEqual(out.B, existing.B);           // but copied, not the same ref
});

test('randomizeGroups with no codes returns an equal copy of existing picks', () => {
  const existing = { A: ['Mexico', 'South Korea'], C: ['Brazil'] };
  const out = randomizeGroups(existing, [], () => 0);
  assert.deepEqual(out, existing);
});

test('randomizeGroups ignores unknown group codes', () => {
  const out = randomizeGroups({ A: ['Mexico'] }, ['ZZ'], () => 0);
  assert.deepEqual(out, { A: ['Mexico'] }); // nothing re-rolled, A preserved
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
