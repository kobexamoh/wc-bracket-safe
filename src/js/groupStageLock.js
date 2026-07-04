/**
 * Group-stage submit lock — reads a Vite env flag so production can close
 * official entries while local dev / previews stay open for testing.
 *
 * Set `VITE_GROUP_STAGE_SUBMIT_LOCKED=true` in Vercel → Production only.
 */

/** Alert shown on login when locked (the fuller message lives in the HTML banner). */
export const GROUP_STAGE_LOCK_BANNER =
  'Group-stage submissions are closed. Your bracket is saved for scoring — click through to Third Place and Knockout to keep predicting.';

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
