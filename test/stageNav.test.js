import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allGroupsRanked,
  isThirdPlaceComplete,
  getStageNavState,
  OFFICIAL_ONLY_MODE,
  STAGE_HEADER_LABELS,
} from '../src/js/stageNav.js';

test('allGroupsRanked requires four picks in every group', () => {
  const picks = {};
  for (const code of 'ABCDEFGHIJKL'.split('')) {
    picks[code] = ['a', 'b', 'c'];
  }
  assert.equal(allGroupsRanked(picks), false);
  picks.A.push('d');
  assert.equal(allGroupsRanked(picks), false);
  for (const code of 'BCDEFGHIJKL'.split('')) {
    picks[code].push('d');
  }
  assert.equal(allGroupsRanked(picks), true);
});

test('isThirdPlaceComplete is true at exactly eight groups', () => {
  assert.equal(isThirdPlaceComplete([]), false);
  assert.equal(isThirdPlaceComplete('ABCDEFGH'.split('')), true);
  assert.equal(isThirdPlaceComplete('ABCDEFGHI'.split('')), false);
});

test('getStageNavState locks third and knockout until prerequisites met (when not official-only)', () => {
  if (OFFICIAL_ONLY_MODE) {
    // Final-week mode: early stages stay disabled regardless of picks.
    const ranked = {};
    for (const code of 'ABCDEFGHIJKL'.split('')) ranked[code] = [1, 2, 3, 4];
    const state = getStageNavState(ranked, 'ABCDEFGH'.split(''), 'officialBracket');
    assert.equal(state.groups.disabled, true);
    assert.equal(state.third.disabled, true);
    assert.equal(state.knockout.disabled, true);
    assert.equal(state.officialBracket.disabled, false);
    assert.equal(state.officialBracket.active, true);
    assert.equal(state.groups.hidden, true);
    return;
  }

  const empty = getStageNavState({}, [], 'groups');
  assert.equal(empty.third.disabled, true);
  assert.equal(empty.knockout.disabled, true);

  const ranked = {};
  for (const code of 'ABCDEFGHIJKL'.split('')) ranked[code] = [1, 2, 3, 4];
  const thirdsReady = getStageNavState(ranked, [], 'third');
  assert.equal(thirdsReady.third.disabled, false);
  assert.equal(thirdsReady.knockout.disabled, true);

  const knockoutReady = getStageNavState(ranked, 'ABCDEFGH'.split(''), 'knockout');
  assert.equal(knockoutReady.knockout.disabled, false);
  assert.equal(knockoutReady.knockout.active, true);
});

test('officialBracket / Final Round stage is always enabled', () => {
  const empty = getStageNavState({}, [], 'groups');
  assert.equal(empty.officialBracket.disabled, false);

  const active = getStageNavState({}, [], 'officialBracket');
  assert.equal(active.officialBracket.active, true);
  assert.equal(active.officialBracket.disabled, false);
  assert.equal(STAGE_HEADER_LABELS.officialBracket, 'The Final Round');
});
