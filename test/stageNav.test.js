import test from 'node:test';
import assert from 'node:assert/strict';
import { allGroupsRanked, isThirdPlaceComplete, getStageNavState } from '../src/js/stageNav.js';

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

test('getStageNavState locks third and knockout until prerequisites met', () => {
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

test('officialBracket stage is always enabled', () => {
  const empty = getStageNavState({}, [], 'groups');
  assert.equal(empty.officialBracket.disabled, false);
  assert.equal(empty.officialBracket.active, false);

  const active = getStageNavState({}, [], 'officialBracket');
  assert.equal(active.officialBracket.active, true);
  assert.equal(active.officialBracket.disabled, false);
});
