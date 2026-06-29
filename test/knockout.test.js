import test from 'node:test';
import assert from 'node:assert/strict';

import { lookupAnnexCOpponents, buildRoundOf32Matches, buildKnockoutBracket, setWinner } from '../src/js/knockout.js';
import { renderKnockoutTree } from '../src/js/knockoutRender.js';

function makePicksWithKnownThirds() {
  // Minimal picks: provide a full 1st->4th order for only the groups we need
  // in the assertions below (others can be empty).
  return {
    A: ['Mexico', 'South Africa', 'South Korea', 'Czech Rep.'], // 3rd = South Korea
    B: ['Canada', 'Bosnia & Herz.', 'Qatar', 'Switzerland'],    // 3rd = Qatar
    C: ['Brazil', 'Morocco', 'Haiti', 'Scotland'],              // 3rd = Haiti
    D: ['United States', 'Paraguay', 'Australia', 'Turkey'],    // 3rd = Australia
    E: ['Germany', 'Curaçao', 'Ivory Coast', 'Ecuador'],        // 3rd = Ivory Coast
    F: ['Netherlands', 'Japan', 'Sweden', 'Tunisia'],           // 3rd = Sweden
    G: ['Belgium', 'Egypt', 'Iran', 'New Zealand'],             // 3rd = Iran
    H: ['Spain', 'Cape Verde', 'Saudi Arabia', 'Uruguay'],      // 3rd = Saudi Arabia
    I: ['France', 'Senegal', 'Iraq', 'Norway'],                 // 3rd = Iraq
    J: ['Argentina', 'Algeria', 'Austria', 'Jordan'],           // 3rd = Austria
    K: ['Portugal', 'DR Congo', 'Uzbekistan', 'Colombia'],      // 3rd = Uzbekistan
    L: ['England', 'Croatia', 'Ghana', 'Panama'],               // 3rd = Ghana
  };
}

test('Annex C lookup maps a qualifying set to the correct winner opponents', () => {
  // Per the extracted table, the first row corresponds to the combination
  // {E,F,G,H,I,J,K,L} (key "EFGHIJKL") and assigns opponents in winner order:
  // A,B,D,E,G,I,K,L -> E,J,I,F,H,G,L,K
  const mapping = lookupAnnexCOpponents(['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
  assert.deepEqual(mapping, { A: 'E', B: 'J', D: 'I', E: 'F', G: 'H', I: 'G', K: 'L', L: 'K' });
});

test('Round of 32 seeding places best-third teams using Annex C mapping', () => {
  const picks = makePicksWithKnownThirds();
  const qualifying = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']; // key EFGHIJKL
  const matches = buildRoundOf32Matches(picks, qualifying);

  const byId = Object.fromEntries(matches.map((m) => [m.id, m]));

  // M79 is Winner A vs Best 3rd (assigned to group E for this combination).
  assert.equal(byId.M79.a.seed, '1A');
  assert.equal(byId.M79.a.team, 'Mexico');
  assert.equal(byId.M79.b.seed, '3E');
  assert.equal(byId.M79.b.team, 'Ivory Coast');

  // M85 is Winner B vs Best 3rd (assigned to group J here).
  assert.equal(byId.M85.a.seed, '1B');
  assert.equal(byId.M85.a.team, 'Canada');
  assert.equal(byId.M85.b.seed, '3J');
  assert.equal(byId.M85.b.team, 'Austria');
});

test('winners propagate into the Round of 16 slots', () => {
  const picks = makePicksWithKnownThirds();
  const qualifying = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']; // key EFGHIJKL
  // Pick winners for two R32 matches that feed into M90: M73 and M75
  let winners = {};
  winners = setWinner(winners, 'M73', 'A'); // 2A beats 2B -> Mexico's group runner-up doesn't matter; in our picks 2A is South Africa
  winners = setWinner(winners, 'M75', 'B'); // 2C beats 1F -> from picks, 2C is Morocco
  const bracket = buildKnockoutBracket(picks, qualifying, winners);
  const m90 = bracket.r16.find((m) => m.id === 'M90');
  assert.equal(m90.a.seed, 'WM73');
  assert.equal(m90.b.seed, 'WM75');
  // WM73 should resolve to runner-up A (South Africa) because side A of M73 is 2A
  assert.equal(m90.a.team, 'South Africa');
  // WM75 side B is 2C => Morocco
  assert.equal(m90.b.team, 'Morocco');
});

test('final and champion resolve from semi-final winners', () => {
  const picks = makePicksWithKnownThirds();
  const qualifying = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']; // key EFGHIJKL

  // Set up winners enough to populate SF and Final quickly:
  // We'll just force winners for M101/M102 directly (even if upstream isn't set),
  // and then pick a final winner. The seeds should carry through.
  let winners = {};
  winners = setWinner(winners, 'M101', 'A');
  winners = setWinner(winners, 'M102', 'B');
  winners = setWinner(winners, 'M104', 'B');

  const bracket = buildKnockoutBracket(picks, qualifying, winners);
  assert.equal(bracket.final.length, 1);
  assert.equal(bracket.final[0].id, 'M104');
  assert.equal(bracket.final[0].a.seed, 'WM101');
  assert.equal(bracket.final[0].b.seed, 'WM102');
  // Champion is winner side of M104 (B)
  assert.equal(bracket.championTeam, bracket.final[0].b.team);
});

test('knockout tree renders left/right halves with connectors and flags', () => {
  const picks = makePicksWithKnownThirds();
  const qualifying = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const bracket = buildKnockoutBracket(picks, qualifying, {});
  const html = renderKnockoutTree(bracket, {});

  assert.match(html, /knockout-scroll/);
  assert.match(html, /bracket-half--left/);
  assert.match(html, /bracket-half--right/);
  assert.match(html, /bracket-connector/);
  assert.match(html, /data-match="M74"/);
  assert.match(html, /data-match="M104"/);
  assert.match(html, /class="bracket-team__flag"/);
  assert.match(html, /champion-display/);
});

test('right half columns run SF inward to R32 on the outer edge', () => {
  const picks = makePicksWithKnownThirds();
  const qualifying = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const bracket = buildKnockoutBracket(picks, qualifying, {});
  const html = renderKnockoutTree(bracket, {});

  const rightStart = html.indexOf('bracket-half--right');
  assert.ok(rightStart >= 0, 'right half markup present');
  const titles = [...html.slice(rightStart).matchAll(/bracket-round__title">([^<]+)</g)]
    .map((m) => m[1])
    .slice(0, 4);
  assert.deepEqual(titles, ['Semi-finals', 'Quarter-finals', 'Round of 16', 'Round of 32']);
});

