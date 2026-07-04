import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isGroupStageSubmitLocked,
  GROUP_STAGE_LOCK_BANNER,
  GROUP_STAGE_LOCK_SUBMIT_ALERT,
} from '../src/js/groupStageLock.js';

test('isGroupStageSubmitLocked is false when env is unset', () => {
  assert.equal(isGroupStageSubmitLocked({}), false);
  assert.equal(isGroupStageSubmitLocked({ VITE_GROUP_STAGE_SUBMIT_LOCKED: undefined }), false);
});

test('isGroupStageSubmitLocked is true for true or 1', () => {
  assert.equal(isGroupStageSubmitLocked({ VITE_GROUP_STAGE_SUBMIT_LOCKED: 'true' }), true);
  assert.equal(isGroupStageSubmitLocked({ VITE_GROUP_STAGE_SUBMIT_LOCKED: '1' }), true);
});

test('isGroupStageSubmitLocked is false for other values', () => {
  assert.equal(isGroupStageSubmitLocked({ VITE_GROUP_STAGE_SUBMIT_LOCKED: 'false' }), false);
  assert.equal(isGroupStageSubmitLocked({ VITE_GROUP_STAGE_SUBMIT_LOCKED: '' }), false);
  assert.equal(isGroupStageSubmitLocked({ VITE_GROUP_STAGE_SUBMIT_LOCKED: 'yes' }), false);
});

test('lock copy strings are non-empty', () => {
  assert.ok(GROUP_STAGE_LOCK_BANNER.length > 20);
  assert.ok(GROUP_STAGE_LOCK_SUBMIT_ALERT.length > 20);
});
