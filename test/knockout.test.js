import test from 'node:test';
import assert from 'node:assert/strict';

import { lookupAnnexCOpponents, buildRoundOf32Matches, buildKnockoutBracket, setWinner, applyWinnerPick, getPodiumPlacements } from '../src/js/knockout.js';
import { renderKnockoutTree, podiumMedalFor } from '../src/js/knockoutRender.js';

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

test('knockout tree renders left/right halves with flags and SVG connector slot', () => {
  const picks = makePicksWithKnownThirds();
  const qualifying = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const bracket = buildKnockoutBracket(picks, qualifying, {});
  const html = renderKnockoutTree(bracket, {});

  assert.match(html, /knockout-scroll/);
  assert.match(html, /bracket-half--left/);
  assert.match(html, /bracket-half--right/);
  assert.match(html, /bracket-pair/);
  assert.match(html, /data-open-qf-help/);
  assert.match(html, /bracket-round--final/);
  assert.match(html, /data-match="M74"/);
  assert.match(html, /data-match="M104"/);
  assert.match(html, /data-match="M103"/);
  assert.match(html, /class="bracket-team__flag"/);
  assert.match(html, /svg class="bracket-lines"/);
  assert.match(html, /knockout-scroll-hint/);
  assert.doesNotMatch(html, /bracket-join/);
  assert.doesNotMatch(html, /Feeds/);
  assert.doesNotMatch(html, /bracket-match__id/);
  assert.doesNotMatch(html, /bracket-team__seed/);
  assert.doesNotMatch(html, /champion-display/);
  assert.match(html, /knockout-canvas/);
});

test('knockout export tree can hide the scroll hint', () => {
  const picks = makePicksWithKnownThirds();
  const qualifying = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const bracket = buildKnockoutBracket(picks, qualifying, {});
  const html = renderKnockoutTree(bracket, {}, { hideScrollHint: true, hidePodiumCta: true });
  assert.doesNotMatch(html, /knockout-scroll-hint/);
  assert.match(html, /svg class="bracket-lines"/);
});

test('startRound sf renders endgame center strip only (no R32/R16/QF columns)', () => {
  const picks = makePicksWithKnownThirds();
  const qualifying = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const bracket = buildKnockoutBracket(picks, qualifying, {});
  const html = renderKnockoutTree(bracket, {}, { startRound: 'sf' });

  assert.match(html, /knockout-canvas--endgame/);
  assert.match(html, /knockout-bracket--endgame/);
  assert.match(html, /bracket-round--final/);
  assert.match(html, /data-match="M101"/);
  assert.match(html, /data-match="M102"/);
  assert.match(html, /data-match="M104"/);
  assert.match(html, /data-match="M103"/);
  assert.doesNotMatch(html, /bracket-half--/);
  assert.doesNotMatch(html, /Round of 32/);
  assert.doesNotMatch(html, /Round of 16/);
  assert.doesNotMatch(html, /Quarter-finals/);
  assert.doesNotMatch(html, /data-match="M74"/);
  assert.doesNotMatch(html, /data-match="M89"/);
  assert.doesNotMatch(html, /data-match="M97"/);
  assert.doesNotMatch(html, /knockout-scroll-hint/);
  assert.doesNotMatch(html, /bracket-lines/);
});

test('startRound r16 omits Round of 32 columns but keeps R16 through final', () => {
  const picks = makePicksWithKnownThirds();
  const qualifying = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const bracket = buildKnockoutBracket(picks, qualifying, {});
  const html = renderKnockoutTree(bracket, {}, { startRound: 'r16' });

  assert.match(html, /knockout-bracket--from-r16/);
  assert.match(html, /Round of 16/);
  assert.match(html, /Quarter-finals/);
  assert.match(html, /data-match="M89"/);
  assert.doesNotMatch(html, /Round of 32/);
  assert.doesNotMatch(html, /data-match="M74"/);
});

test('semi-finals render in a horizontal row flanking the final', () => {
  const picks = makePicksWithKnownThirds();
  const qualifying = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const bracket = buildKnockoutBracket(picks, qualifying, {});
  const html = renderKnockoutTree(bracket, {});

  assert.match(html, /bracket-center__final-row/);
  const centerStart = html.indexOf('bracket-center__final-row');
  const centerRow = html.slice(centerStart, html.indexOf('bracket-center__third'));
  const m101 = centerRow.indexOf('data-match="M101"');
  const m104 = centerRow.indexOf('data-match="M104"');
  const m102 = centerRow.indexOf('data-match="M102"');
  assert.ok(m101 >= 0 && m104 > m101 && m102 > m104, 'M101 | Final | M102 left-to-right');
});

test('third-place match seeds from semi-final losers', () => {
  const picks = makePicksWithKnownThirds();
  const qualifying = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  let winners = {};
  winners = setWinner(winners, 'M101', 'A');
  winners = setWinner(winners, 'M102', 'B');
  const bracket = buildKnockoutBracket(picks, qualifying, winners);
  assert.equal(bracket.thirdPlace[0].id, 'M103');
  assert.equal(bracket.thirdPlace[0].a.seed, 'LM101');
  assert.equal(bracket.thirdPlace[0].b.seed, 'LM102');
});

test('podium placements resolve champion, runner-up, and third-place picks', () => {
  const picks = makePicksWithKnownThirds();
  const qualifying = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  let winners = {};
  winners = setWinner(winners, 'M101', 'A');
  winners = setWinner(winners, 'M102', 'B');
  winners = setWinner(winners, 'M104', 'A');
  winners = setWinner(winners, 'M103', 'B');
  const bracket = buildKnockoutBracket(picks, qualifying, winners);
  const podium = getPodiumPlacements(bracket, winners);
  assert.equal(podium.first, bracket.final[0].a.team);
  assert.equal(podium.second, bracket.final[0].b.team);
  assert.equal(podium.third, bracket.thirdPlace[0].b.team);
  assert.equal(podium.fourth, bracket.thirdPlace[0].a.team);
});

test('podiumMedalFor awards gold/silver on Final and bronze on third-place winner', () => {
  assert.equal(podiumMedalFor('M104', 'A', 'A')?.place, 'gold');
  assert.equal(podiumMedalFor('M104', 'B', 'A')?.place, 'silver');
  assert.equal(podiumMedalFor('M103', 'B', 'B')?.place, 'bronze');
  assert.equal(podiumMedalFor('M103', 'A', 'B'), null);
  assert.equal(podiumMedalFor('M101', 'A', 'A'), null);
  assert.equal(podiumMedalFor('M104', 'A', null), null);
});

test('Final and third-place picks render medal badges beside team names', () => {
  const picks = makePicksWithKnownThirds();
  const qualifying = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  let winners = {};
  winners = setWinner(winners, 'M101', 'A');
  winners = setWinner(winners, 'M102', 'B');
  winners = setWinner(winners, 'M104', 'A');
  winners = setWinner(winners, 'M103', 'B');
  const bracket = buildKnockoutBracket(picks, qualifying, winners);
  const html = renderKnockoutTree(bracket, winners, { startRound: 'sf' });

  assert.match(html, /bracket-team__medal--gold/);
  assert.match(html, /bracket-team__medal--silver/);
  assert.match(html, /bracket-team__medal--bronze/);
  assert.match(html, /bracket-round--sf/);
  assert.match(html, /bracket-round--third/);
  // Semis must not inherit Final medals
  const sfChunk = html.slice(html.indexOf('bracket-round--sf'), html.indexOf('bracket-round--final'));
  assert.doesNotMatch(sfChunk, /bracket-team__medal/);
});

test('right half columns run QF inward to R32 on the outer edge', () => {
  const picks = makePicksWithKnownThirds();
  const qualifying = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const bracket = buildKnockoutBracket(picks, qualifying, {});
  const html = renderKnockoutTree(bracket, {});

  const rightStart = html.indexOf('bracket-half--right');
  assert.ok(rightStart >= 0, 'right half markup present');
  const titles = [...html.slice(rightStart).matchAll(/bracket-round__title">([^<]+)</g)]
    .map((m) => m[1])
    .slice(0, 3);
  assert.deepEqual(titles, ['Quarter-finals', 'Round of 16', 'Round of 32']);
});

test('semi-finals render in the center strip flanking the final', () => {
  const picks = makePicksWithKnownThirds();
  const qualifying = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const bracket = buildKnockoutBracket(picks, qualifying, {});
  const html = renderKnockoutTree(bracket, {});

  const centerStart = html.indexOf('bracket-center');
  assert.ok(centerStart >= 0);
  const centerHtml = html.slice(centerStart, html.indexOf('bracket-half--right'));
  assert.match(centerHtml, /data-match="M101"/);
  assert.match(centerHtml, /data-match="M102"/);
  assert.match(centerHtml, /data-match="M104"/);
  assert.match(centerHtml, /data-match="M103"/);
  assert.doesNotMatch(centerHtml, /bracket-half--left/);
});

test('toggling a winner off clears downstream picks', () => {
  const picks = makePicksWithKnownThirds();
  const qualifying = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  let winners = {};
  winners = setWinner(winners, 'M73', 'A');
  winners = setWinner(winners, 'M75', 'B');
  winners = setWinner(winners, 'M90', 'A');
  winners = applyWinnerPick(winners, 'M73', 'A', picks, qualifying);
  assert.equal(winners.M73, undefined);
  assert.equal(winners.M90, undefined);
});

test('QF rounds use solo pair layout (one match per pair)', () => {
  const picks = makePicksWithKnownThirds();
  const qualifying = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const bracket = buildKnockoutBracket(picks, qualifying, {});
  const html = renderKnockoutTree(bracket, {});

  const soloCount = (html.match(/bracket-pair--solo/g) || []).length;
  assert.ok(soloCount >= 4, 'four solo QF pairs');
});

