/**
 * Real-results knockout bracket: builds the bracket from actual FIFA outcomes,
 * resolves team-name winners to A/B sides, and determines which matches are
 * locked (completed in real life) vs pickable (user predictions).
 */

import {
  REAL_GROUP_STANDINGS,
  QUALIFYING_THIRD_GROUPS,
  REAL_MATCH_WINNERS,
} from './realResults.js';
import {
  buildKnockoutBracket,
  findMatchInBracket,
  pruneStaleWinners,
} from './knockout.js';

const MATCH_ORDER = [
  'M73', 'M74', 'M75', 'M76', 'M77', 'M78', 'M79', 'M80',
  'M81', 'M82', 'M83', 'M84', 'M85', 'M86', 'M87', 'M88',
  'M89', 'M90', 'M91', 'M92', 'M93', 'M94', 'M95', 'M96',
  'M97', 'M98', 'M99', 'M100',
  'M101', 'M102',
  'M103', 'M104',
];

/** Group standings in the same { [groupCode]: [team, ...] } shape as user picks. */
export function buildRealGroupPicks() {
  return { ...REAL_GROUP_STANDINGS };
}

/**
 * Convert team-name winners to { matchId: 'A'|'B' } by building the bracket
 * iteratively — each round's teams depend on the prior round's winners.
 */
export function resolveRealWinners(teamWinners = REAL_MATCH_WINNERS) {
  const picks = buildRealGroupPicks();
  const winners = {};

  for (const matchId of MATCH_ORDER) {
    const winnerTeam = teamWinners[matchId];
    if (!winnerTeam) continue;

    const bracket = buildKnockoutBracket(picks, QUALIFYING_THIRD_GROUPS, winners);
    const match = findMatchInBracket(bracket, matchId);
    if (!match) continue;

    if (match.a.team === winnerTeam) winners[matchId] = 'A';
    else if (match.b.team === winnerTeam) winners[matchId] = 'B';
  }

  return winners;
}

/** Set of match IDs that have a real-world result (locked, not user-pickable). */
export function getLockedMatchIds(teamWinners = REAL_MATCH_WINNERS) {
  return new Set(
    Object.keys(teamWinners).filter((id) => teamWinners[id] && !String(teamWinners[id]).startsWith('/'))
  );
}

/**
 * Merge real (locked) winners with the user's own picks for unlocked matches.
 * Real results always win; user picks on locked matches are silently dropped.
 */
export function mergeRealAndUserWinners(realWinners, userWinners = {}) {
  const merged = { ...realWinners };
  const locked = new Set(Object.keys(realWinners));
  for (const [matchId, side] of Object.entries(userWinners)) {
    if (!locked.has(matchId)) merged[matchId] = side;
  }
  return merged;
}

/**
 * Build the full real-results bracket with locked + user-predicted winners.
 * Returns { bracket, mergedWinners, lockedSet }.
 */
export function buildRealResultsBracket(userWinners = {}) {
  const picks = buildRealGroupPicks();
  const realWinners = resolveRealWinners();
  const lockedSet = getLockedMatchIds();
  const merged = mergeRealAndUserWinners(realWinners, userWinners);
  const bracket = buildKnockoutBracket(picks, QUALIFYING_THIRD_GROUPS, merged);
  return { bracket, mergedWinners: merged, lockedSet };
}

/**
 * Apply a user pick on the real-results bracket.
 * Refuses to change locked matches; prunes stale downstream picks.
 */
export function applyRealWinnerPick(userWinners, matchId, side) {
  const lockedSet = getLockedMatchIds();
  if (lockedSet.has(matchId)) return { ...userWinners };

  const picks = buildRealGroupPicks();
  const realWinners = resolveRealWinners();
  const merged = mergeRealAndUserWinners(realWinners, userWinners);

  const next = { ...merged };
  if (next[matchId] === side) delete next[matchId];
  else next[matchId] = side;

  const pruned = pruneStaleWinners(next, picks, QUALIFYING_THIRD_GROUPS);

  // Strip out real winners — only return the user's own picks
  const userOnly = {};
  for (const [id, s] of Object.entries(pruned)) {
    if (!lockedSet.has(id)) userOnly[id] = s;
  }
  return userOnly;
}
