import test from 'node:test';
import assert from 'node:assert/strict';

import {
  draftKey,
  saveDraft,
  readDraft,
  clearDraft,
  shouldRestoreDraft,
} from '../src/js/draftStore.js';

// A tiny in-memory stand-in for window.localStorage. `overrides` lets a test
// swap in a throwing setItem to simulate quota / private-mode failures.
function makeStorage(overrides = {}) {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    map,
    ...overrides,
  };
}

test('draftKey namespaces by user id', () => {
  assert.equal(draftKey('abc'), 'wc-bracket-draft:abc');
});

test('saveDraft + readDraft round-trips picks and metadata', () => {
  const storage = makeStorage();
  const ok = saveDraft(storage, 'user-1', { A: ['Mexico', 'South Africa'] }, 'ts-1', null, 1234);

  assert.equal(ok, true);
  const draft = readDraft(storage, 'user-1');
  assert.deepEqual(draft.picks, { A: ['Mexico', 'South Africa'] });
  assert.equal(draft.baseUpdatedAt, 'ts-1');
  assert.equal(draft.updatedAt, 1234);
});

test('saveDraft validates before storing (drops unknown teams and duplicates)', () => {
  const storage = makeStorage();
  saveDraft(storage, 'user-1', { A: ['Mexico', 'Mexico', 'Atlantis', 'South Africa'] });

  assert.deepEqual(readDraft(storage, 'user-1').picks, { A: ['Mexico', 'South Africa'] });
});

test('readDraft returns null when there is no draft', () => {
  assert.equal(readDraft(makeStorage(), 'nobody'), null);
});

test('readDraft returns null when the draft is empty after validation', () => {
  const storage = makeStorage();
  // Only an unknown team — nothing survives validation, so there is no real draft.
  storage.setItem(draftKey('user-1'), JSON.stringify({ picks: { A: ['Atlantis'] } }));

  assert.equal(readDraft(storage, 'user-1'), null);
});

test('readDraft returns null on malformed JSON instead of throwing', () => {
  const storage = makeStorage();
  storage.setItem(draftKey('user-1'), 'not-json{');

  assert.doesNotThrow(() => readDraft(storage, 'user-1'));
  assert.equal(readDraft(storage, 'user-1'), null);
});

test('clearDraft removes the stored draft', () => {
  const storage = makeStorage();
  saveDraft(storage, 'user-1', { A: ['Mexico', 'South Africa'] });
  clearDraft(storage, 'user-1');

  assert.equal(readDraft(storage, 'user-1'), null);
});

test('saveDraft / readDraft fail quietly when storage is missing', () => {
  assert.equal(saveDraft(null, 'user-1', { A: ['Mexico'] }), false);
  assert.equal(saveDraft(makeStorage(), '', { A: ['Mexico'] }), false);
  assert.equal(readDraft(null, 'user-1'), null);
});

test('saveDraft returns false and never throws when storage rejects writes', () => {
  const throwing = makeStorage({ setItem: () => { throw new Error('QuotaExceeded'); } });

  assert.doesNotThrow(() => saveDraft(throwing, 'user-1', { A: ['Mexico', 'South Africa'] }));
  assert.equal(saveDraft(throwing, 'user-1', { A: ['Mexico', 'South Africa'] }), false);
});

test('shouldRestoreDraft restores only when the draft is based on the current DB version', () => {
  assert.equal(shouldRestoreDraft(null, 'ts-1'), false); // no draft
  assert.equal(shouldRestoreDraft({ baseUpdatedAt: null }, null), true); // first-ever edits
  assert.equal(shouldRestoreDraft({ baseUpdatedAt: 'ts-1' }, 'ts-1'), true); // DB unchanged
  assert.equal(shouldRestoreDraft({ baseUpdatedAt: 'ts-1' }, 'ts-2'), false); // saved elsewhere
  assert.equal(shouldRestoreDraft({ baseUpdatedAt: null }, 'ts-2'), false); // DB row appeared since
});
