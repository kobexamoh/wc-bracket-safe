/**
 * Group-stage submit lock — reads a Vite env flag so production can close
 * official entries while local dev / previews stay open for testing.
 *
 * Set `VITE_GROUP_STAGE_SUBMIT_LOCKED=true` in Vercel → Production only.
 */

/** Banner on the Group Stage tab when locked. */
export const GROUP_STAGE_LOCK_BANNER =
  'Group-stage submissions are closed — the real group stage has finished. Saved brackets stay on file for scoring. You can still pick Third Place and Knockout.';

/** Short alert when someone tries to submit while locked. */
export const GROUP_STAGE_LOCK_SUBMIT_ALERT =
  'Group-stage submissions are closed. Your saved bracket is on file for scoring.';

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
export function isGroupStageSubmitLocked(env) {
  const source = env ?? (typeof import.meta !== 'undefined' ? import.meta.env : {});
  const raw = source.VITE_GROUP_STAGE_SUBMIT_LOCKED;
  return raw === 'true' || raw === '1';
}
