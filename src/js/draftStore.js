/**
 * Local draft autosave.
 *
 * Drafts live in the browser (localStorage) so an accidental refresh can't eat
 * unsaved picks. They are deliberately separate from the DB `brackets` row:
 *   - a *draft* is work-in-progress and may be incomplete;
 *   - a *saved bracket* is the official, complete, RLS-protected DB row.
 *
 * The storage object is passed in (dependency injection, like bracketStore's
 * Supabase client) so this module stays import-safe and unit-testable without a
 * real browser. Every access is wrapped so private-mode / quota errors fail
 * quietly instead of breaking the app.
 *
 * Stored shape: { picks, knockout, baseUpdatedAt, updatedAt }
 *   - picks:        validated { [groupCode]: [teamName, ...] }
 *   - knockout:     validated { winners, thirdGroups } (knockout-stage picks)
 *   - baseUpdatedAt: the DB row's `updated_at` when editing began (the version
 *                    this draft was based on). Used to decide, on load, whether
 *                    the draft is still safe to restore.
 *   - updatedAt:    when the draft itself was written (client time; advisory).
 */

import { validatePicks, validateKnockoutMeta } from './bracketStore.js';

const DRAFT_PREFIX = 'wc-bracket-draft:';

export function draftKey(userId) {
  return `${DRAFT_PREFIX}${userId}`;
}

/**
 * Persist a draft for the user. Validates first so a stale/tampered payload can
 * never poison the UI. Returns false (instead of throwing) when storage is
 * unavailable or full, so callers can fall back gracefully.
 */
export function saveDraft(storage, userId, picks, baseUpdatedAt = null, knockout = null, now = Date.now()) {
  if (!storage || !userId) return false;
  try {
    const payload = JSON.stringify({
      picks: validatePicks(picks),
      knockout: validateKnockoutMeta(knockout),
      baseUpdatedAt: baseUpdatedAt ?? null,
      updatedAt: now,
    });
    storage.setItem(draftKey(userId), payload);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the user's draft. Returns the validated draft, or null when there is
 * none, it can't be parsed, or it is empty after validation.
 */
export function readDraft(storage, userId) {
  if (!storage || !userId) return null;
  try {
    const raw = storage.getItem(draftKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const picks = validatePicks(parsed?.picks);
    const knockout = validateKnockoutMeta(parsed?.knockout);
    if (Object.keys(picks).length === 0 && Object.keys(knockout.winners).length === 0
      && knockout.thirdGroups.length === 0) return null;

    return {
      picks,
      knockout,
      baseUpdatedAt: parsed?.baseUpdatedAt ?? null,
      updatedAt: parsed?.updatedAt ?? null,
    };
  } catch {
    return null;
  }
}

export function clearDraft(storage, userId) {
  if (!storage || !userId) return;
  try {
    storage.removeItem(draftKey(userId));
  } catch {
    /* nothing useful to do if removal fails */
  }
}

/**
 * Decide whether a local draft should be restored over the DB row on load.
 *
 * We compare the draft's base version to the *current* DB `updated_at` by
 * equality of the server-issued timestamps — never by comparing client clocks,
 * which can be skewed across devices:
 *   - equal  -> the DB hasn't changed since we last synced, so the draft holds
 *               newer local edits -> restore it.
 *   - differ -> another device saved a newer bracket -> the DB wins; the draft
 *               is stale and should be discarded.
 * First-ever edits (no DB row yet) compare null === null and restore correctly.
 */
export function shouldRestoreDraft(draft, dbUpdatedAt) {
  if (!draft) return false;
  return (draft.baseUpdatedAt ?? null) === (dbUpdatedAt ?? null);
}
