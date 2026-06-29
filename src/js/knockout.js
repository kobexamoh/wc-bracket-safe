import { ANNEX_C_WINNERS, ANNEX_C_ROWS } from './thirdPlaceAssignments.js';
import { getGroupOrder, getGroupTeamNames } from './bracketData.js';

export const GROUP_CODES = getGroupOrder();

function isGroupCode(code) {
  return GROUP_CODES.includes(code);
}

function normalizeGroupList(groups = []) {
  return Array.from(new Set(groups.map((g) => String(g).toUpperCase()).filter(isGroupCode)));
}

function sortGroupKey(groups) {
  return normalizeGroupList(groups).sort().join('');
}

// Build a lookup keyed by the sorted 8-group combination (e.g. "EFGHIJKL")
// mapping to the corresponding Annex C row string (letters in column order).
let annexLookup = null;
function getAnnexLookup() {
  if (annexLookup) return annexLookup;
  annexLookup = new Map();
  for (const row of ANNEX_C_ROWS) {
    const key = row.split('').slice().sort().join('');
    annexLookup.set(key, row);
  }
  return annexLookup;
}

/**
 * Compute the group placings from saved picks.
 * Output shape:
 * {
 *   A: { first, second, third, fourth },
 *   ...
 * }
 * Missing ranks are null.
 */
export function computeGroupPlacings(picks = {}) {
  const out = {};
  for (const code of GROUP_CODES) {
    const teams = getGroupTeamNames(code);
    const ranked = Array.isArray(picks[code]) ? picks[code].filter((t) => teams.includes(t)) : [];
    out[code] = {
      first: ranked[0] ?? null,
      second: ranked[1] ?? null,
      third: ranked[2] ?? null,
      fourth: ranked[3] ?? null,
    };
  }
  return out;
}

/**
 * Third-place candidates are the 3rd-ranked team from each group (if present).
 */
export function getThirdPlaceCandidates(picks = {}) {
  const placings = computeGroupPlacings(picks);
  return GROUP_CODES.map((code) => ({
    group: code,
    team: placings[code].third,
  }));
}

/**
 * Annex C mapping: for the given 8 qualifying third-place GROUPS, return the
 * 8 opponents (GROUP letter) for the winner groups in ANNEX_C_WINNERS order.
 *
 * Returns a map: { A: 'E', B: 'J', ... } where value is the third-place group.
 */
export function lookupAnnexCOpponents(qualifyingThirdGroups = []) {
  const key = sortGroupKey(qualifyingThirdGroups);
  if (key.length !== 8) {
    throw new Error('Need exactly 8 qualifying third-place groups');
  }
  const row = getAnnexLookup().get(key);
  if (!row) {
    throw new Error('Unknown Annex C combination');
  }
  const mapping = {};
  for (let i = 0; i < ANNEX_C_WINNERS.length; i++) {
    mapping[ANNEX_C_WINNERS[i]] = row[i];
  }
  return mapping;
}

/**
 * FIFA Regulations Article 12.5/12.6 Round of 32 match list (match numbers).
 * Some matches are fixed (winner/runner-up), and eight matches depend on the
 * Annex C assignment of which third-place groups qualify.
 *
 * We return matches in a stable bracket order so the UI can lay them out.
 */
export function buildRoundOf32Matches(picks = {}, qualifyingThirdGroups = []) {
  const placings = computeGroupPlacings(picks);
  const thirdMap = lookupAnnexCOpponents(qualifyingThirdGroups);

  const teamBySeed = (seed) => {
    const group = seed.slice(1);
    const place = seed[0];
    if (!isGroupCode(group)) return null;
    if (place === '1') return placings[group].first;
    if (place === '2') return placings[group].second;
    if (place === '3') return placings[group].third;
    return null;
  };

  const thirdSeedForWinner = (winnerGroup) => {
    const thirdGroup = thirdMap[winnerGroup];
    if (!thirdGroup) return null;
    return `3${thirdGroup}`;
  };

  // Matches per FIFA Art. 12.5 table:
  // (1) M73: 2A v 2B
  // (2) M74: 1E v Best3 (assigned)
  // (3) M75: 1F v 2C
  // (4) M76: 1C v 2F
  // (5) M77: 1I v Best3
  // (6) M78: 2E v 2I
  // (7) M79: 1A v Best3
  // (8) M80: 1L v Best3
  // (9) M81: 1D v Best3
  // (10) M82: 1G v Best3
  // (11) M83: 2K v 2L
  // (12) M84: 1H v 2J
  // (13) M85: 1B v Best3
  // (14) M86: 1J v 2H
  // (15) M87: 1K v Best3
  // (16) M88: 2D v 2G

  const raw = [
    { id: 'M73', a: '2A', b: '2B' },
    { id: 'M74', a: '1E', b: thirdSeedForWinner('E') },
    { id: 'M75', a: '1F', b: '2C' },
    { id: 'M76', a: '1C', b: '2F' },
    { id: 'M77', a: '1I', b: thirdSeedForWinner('I') },
    { id: 'M78', a: '2E', b: '2I' },
    { id: 'M79', a: '1A', b: thirdSeedForWinner('A') },
    { id: 'M80', a: '1L', b: thirdSeedForWinner('L') },
    { id: 'M81', a: '1D', b: thirdSeedForWinner('D') },
    { id: 'M82', a: '1G', b: thirdSeedForWinner('G') },
    { id: 'M83', a: '2K', b: '2L' },
    { id: 'M84', a: '1H', b: '2J' },
    { id: 'M85', a: '1B', b: thirdSeedForWinner('B') },
    { id: 'M86', a: '1J', b: '2H' },
    { id: 'M87', a: '1K', b: thirdSeedForWinner('K') },
    { id: 'M88', a: '2D', b: '2G' },
  ];

  return raw.map((m) => ({
    id: m.id,
    a: { seed: m.a, team: m.a ? teamBySeed(m.a) : null },
    b: { seed: m.b, team: m.b ? teamBySeed(m.b) : null },
  }));
}

// Regulation bracket wiring for later rounds (by Round-of-32 match numbers).
// Round of 16 (Art. 12.7)
const R16 = [
  { id: 'M89', from: ['M74', 'M77'] },
  { id: 'M90', from: ['M73', 'M75'] },
  { id: 'M91', from: ['M76', 'M78'] },
  { id: 'M92', from: ['M79', 'M80'] },
  { id: 'M93', from: ['M83', 'M84'] },
  { id: 'M94', from: ['M81', 'M82'] },
  { id: 'M95', from: ['M86', 'M88'] },
  { id: 'M96', from: ['M85', 'M87'] },
];

// Quarter-finals (Art. 12.8)
const QF = [
  { id: 'M97', from: ['M89', 'M90'] },
  { id: 'M98', from: ['M93', 'M94'] },
  { id: 'M99', from: ['M91', 'M92'] },
  { id: 'M100', from: ['M95', 'M96'] },
];

// Semi-finals (Art. 12.9) and finals (12.10). The PDF text extraction beyond
// M99 is messy, but the standard structure is:
// SF: W97 v W98, W99 v W100; Final: winners; Third-place: losers.
const SF = [
  { id: 'M101', from: ['M97', 'M98'] },
  { id: 'M102', from: ['M99', 'M100'] },
];

export const KNOCKOUT_WIRING = { R16, QF, SF };

// Visual bracket layout (Athletic-style left/right halves converging on the final).
// Match order within each round is top-to-bottom on that half.
export const BRACKET_LAYOUT = {
  left: {
    r32: ['M74', 'M77', 'M73', 'M75', 'M76', 'M78', 'M79', 'M80'],
    r16: ['M89', 'M90', 'M91', 'M92'],
    qf: ['M97', 'M99'],
    sf: ['M101'],
  },
  right: {
    r32: ['M84', 'M83', 'M82', 'M81', 'M86', 'M88', 'M87', 'M85'],
    r16: ['M93', 'M94', 'M95', 'M96'],
    qf: ['M98', 'M100'],
    sf: ['M102'],
  },
  feeds: {
    r32: ['M89', 'M90', 'M91', 'M92', 'M93', 'M94', 'M95', 'M96'],
    r16: ['M97', 'M99', 'M98', 'M100'],
    qf: ['M101', 'M102'],
    sf: ['M104', 'M104'],
  },
};

export function emptyWinners() {
  return {};
}

function winnerOf(winners, matchId) {
  return winners && winners[matchId] ? winners[matchId] : null;
}

/**
 * Build a structured knockout bracket:
 * - r32: seeded from group picks + Annex C mapping
 * - r16/qf/sf: seeded from winners of prior matches
 *
 * winners is a map: { [matchId]: 'A'|'B' } indicating which side won.
 */
export function buildKnockoutBracket(picks = {}, qualifyingThirdGroups = [], winners = {}) {
  const r32 = buildRoundOf32Matches(picks, qualifyingThirdGroups);

  const teamByMatchSide = (match, side) => (side === 'A' ? match.a.team : match.b.team);

  const r32ById = Object.fromEntries(r32.map((m) => [m.id, m]));

  const seedFrom = (fromId) => {
    const m = r32ById[fromId] || null;
    if (!m) return { seed: `W${fromId}`, team: null };
    const w = winnerOf(winners, fromId);
    const team = w ? teamByMatchSide(m, w) : null;
    return { seed: `W${fromId}`, team };
  };

  const r16 = R16.map((m) => ({
    id: m.id,
    a: seedFrom(m.from[0]),
    b: seedFrom(m.from[1]),
  }));

  const r16ById = Object.fromEntries(r16.map((m) => [m.id, m]));
  const seedFrom16 = (fromId) => {
    const m = r16ById[fromId] || null;
    if (!m) return { seed: `W${fromId}`, team: null };
    const w = winnerOf(winners, fromId);
    const team = w ? (w === 'A' ? m.a.team : m.b.team) : null;
    return { seed: `W${fromId}`, team };
  };

  const qf = QF.map((m) => ({
    id: m.id,
    a: seedFrom16(m.from[0]),
    b: seedFrom16(m.from[1]),
  }));

  const qfById = Object.fromEntries(qf.map((m) => [m.id, m]));
  const seedFromQf = (fromId) => {
    const m = qfById[fromId] || null;
    if (!m) return { seed: `W${fromId}`, team: null };
    const w = winnerOf(winners, fromId);
    const team = w ? (w === 'A' ? m.a.team : m.b.team) : null;
    return { seed: `W${fromId}`, team };
  };

  const sf = SF.map((m) => ({
    id: m.id,
    a: seedFromQf(m.from[0]),
    b: seedFromQf(m.from[1]),
  }));

  const sfById = Object.fromEntries(sf.map((m) => [m.id, m]));
  const seedFromSf = (fromId) => {
    const m = sfById[fromId] || null;
    if (!m) return { seed: `W${fromId}`, team: null };
    const w = winnerOf(winners, fromId);
    const team = w ? (w === 'A' ? m.a.team : m.b.team) : null;
    return { seed: `W${fromId}`, team };
  };

  const final = [
    {
      id: 'M104',
      a: seedFromSf('M101'),
      b: seedFromSf('M102'),
    },
  ];

  const finalWinner = winnerOf(winners, 'M104');
  const championTeam = finalWinner ? (finalWinner === 'A' ? final[0].a.team : final[0].b.team) : null;

  return { r32, r16, qf, sf, final, championTeam };
}

export function setWinner(winners = {}, matchId, side) {
  const next = { ...winners };
  if (!matchId) return next;
  if (side !== 'A' && side !== 'B') {
    delete next[matchId];
    return next;
  }
  next[matchId] = side;
  return next;
}

