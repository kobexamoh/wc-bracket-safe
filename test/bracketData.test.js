import test from 'node:test';
import assert from 'node:assert/strict';

import { getTournamentGroups, getGroupOrder, getGroupTeamNames, renderBracket } from '../src/js/bracketData.js';

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
