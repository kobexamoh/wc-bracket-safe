import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  REAL_GROUP_STANDINGS,
  QUALIFYING_THIRD_GROUPS,
  REAL_MATCH_WINNERS,
} from '../src/js/realResults.js';
import {
  buildRealGroupPicks,
  resolveRealWinners,
  getLockedMatchIds,
  mergeRealAndUserWinners,
  buildRealResultsBracket,
  applyRealWinnerPick,
} from '../src/js/realKnockout.js';
import { getGroupOrder, getGroupTeamNames } from '../src/js/bracketData.js';
import { findMatchInBracket } from '../src/js/knockout.js';

describe('realResults data', () => {
  it('has standings for all 12 groups using valid team names', () => {
    for (const code of getGroupOrder()) {
      const standing = REAL_GROUP_STANDINGS[code];
      assert.ok(Array.isArray(standing), `Missing group ${code}`);
      assert.equal(standing.length, 4, `Group ${code} should have 4 teams`);
      const valid = getGroupTeamNames(code);
      for (const team of standing) {
        assert.ok(valid.includes(team), `"${team}" not in group ${code} (expected one of ${valid})`);
      }
    }
  });

  it('has exactly 8 qualifying third-place groups', () => {
    assert.equal(QUALIFYING_THIRD_GROUPS.length, 8);
    const allGroups = getGroupOrder();
    for (const g of QUALIFYING_THIRD_GROUPS) {
      assert.ok(allGroups.includes(g), `"${g}" is not a valid group`);
    }
  });

  it('has 16 R32 winners', () => {
    const r32 = Object.keys(REAL_MATCH_WINNERS).filter((id) => {
      const n = parseInt(id.slice(1), 10);
      return n >= 73 && n <= 88;
    });
    assert.equal(r32.length, 16, 'Expected 16 R32 results');
  });
});

describe('resolveRealWinners', () => {
  it('converts all 16 R32 team-name winners to A/B sides', () => {
    const winners = resolveRealWinners();
    const r32Ids = Object.keys(REAL_MATCH_WINNERS).filter((id) => {
      const n = parseInt(id.slice(1), 10);
      return n >= 73 && n <= 88;
    });
    for (const id of r32Ids) {
      assert.ok(winners[id] === 'A' || winners[id] === 'B', `${id} should resolve to A or B, got ${winners[id]}`);
    }
  });

  it('produces correct known winners', () => {
    const winners = resolveRealWinners();
    assert.equal(winners.M73, 'B', 'M73: Canada (side B) beat South Africa');
    assert.equal(winners.M76, 'A', 'M76: Brazil (side A) beat Japan');
    assert.equal(winners.M84, 'A', 'M84: Spain (side A) beat Austria');
    assert.equal(winners.M88, 'B', 'M88: Egypt (side B) beat Australia');
  });
});

describe('getLockedMatchIds', () => {
  it('returns the set of completed match IDs', () => {
    const locked = getLockedMatchIds();
    assert.ok(locked.has('M73'));
    assert.ok(locked.has('M88'));
    assert.ok(locked.has('M89'), 'R16 M89 should be locked');
    assert.ok(locked.has('M96'), 'R16 M96 should be locked');
    assert.ok(!locked.has('M97'), 'M97 QF should still be pickable');
  });
});

describe('mergeRealAndUserWinners', () => {
  it('real results override user picks on locked matches', () => {
    const real = { M73: 'B', M74: 'B' };
    const user = { M73: 'A', M89: 'A' };
    const merged = mergeRealAndUserWinners(real, user);
    assert.equal(merged.M73, 'B', 'locked match keeps real result');
    assert.equal(merged.M89, 'A', 'unlocked match keeps user pick');
  });
});

describe('buildRealResultsBracket', () => {
  it('builds a bracket with R16 teams populated', () => {
    const { bracket, lockedSet } = buildRealResultsBracket();
    const m89 = findMatchInBracket(bracket, 'M89');
    assert.ok(m89, 'M89 should exist');
    assert.ok(m89.a.team, 'M89 side A should have a team');
    assert.ok(m89.b.team, 'M89 side B should have a team');
    assert.ok(lockedSet.size >= 16, 'At least 16 R32 matches should be locked');
  });

  it('R16 matchups match the real schedule', () => {
    const { bracket } = buildRealResultsBracket();
    const m89 = findMatchInBracket(bracket, 'M89');
    const m90 = findMatchInBracket(bracket, 'M90');
    const m91 = findMatchInBracket(bracket, 'M91');
    const m92 = findMatchInBracket(bracket, 'M92');
    const m93 = findMatchInBracket(bracket, 'M93');
    const m94 = findMatchInBracket(bracket, 'M94');
    const m95 = findMatchInBracket(bracket, 'M95');
    const m96 = findMatchInBracket(bracket, 'M96');

    assert.deepEqual([m89.a.team, m89.b.team], ['Paraguay', 'France']);
    assert.deepEqual([m90.a.team, m90.b.team], ['Canada', 'Morocco']);
    assert.deepEqual([m91.a.team, m91.b.team], ['Brazil', 'Norway']);
    assert.deepEqual([m92.a.team, m92.b.team], ['Mexico', 'England']);
    assert.deepEqual([m93.a.team, m93.b.team], ['Portugal', 'Spain']);
    assert.deepEqual([m94.a.team, m94.b.team], ['United States', 'Belgium']);
    assert.deepEqual([m95.a.team, m95.b.team], ['Argentina', 'Egypt']);
    assert.deepEqual([m96.a.team, m96.b.team], ['Switzerland', 'Colombia']);
  });
});

describe('applyRealWinnerPick', () => {
  it('refuses to change a locked match', () => {
    const result = applyRealWinnerPick({}, 'M73', 'A');
    assert.ok(!result.M73, 'Locked match M73 should not appear in user picks');
  });

  it('allows picking an unlocked quarter-final match', () => {
    const result = applyRealWinnerPick({}, 'M97', 'A');
    assert.equal(result.M97, 'A');
  });

  it('toggles off on same-side re-pick', () => {
    const first = applyRealWinnerPick({}, 'M97', 'A');
    assert.equal(first.M97, 'A');
    const second = applyRealWinnerPick(first, 'M97', 'A');
    assert.ok(!second.M97, 'Re-picking same side should clear');
  });
});
