/**
 * Bracket persistence + validation.
 *
 * The Supabase client is passed in (dependency injection) so this module stays
 * import-safe for unit tests — importing it never touches env vars or the DOM.
 *
 * Picks shape: { [groupCode]: [teamName, ...] } where array order is the
 * predicted finishing position (index 0 = 1st). The top 2 advance.
 */

import { getGroupOrder, getGroupTeamNames, MAX_RANK } from './bracketData.js';

/**
 * Keep only legitimate picks: real teams for that group, no duplicates, capped
 * at MAX_RANK, original order preserved. Anything else is silently dropped so a
 * tampered or stale payload can never poison the UI or the database.
 */
export function validatePicks(picks) {
  const clean = {};
  if (!picks || typeof picks !== 'object') return clean;

  for (const code of getGroupOrder()) {
    const validTeams = getGroupTeamNames(code);
    const raw = Array.isArray(picks[code]) ? picks[code] : [];
    const seen = new Set();
    const ordered = [];

    for (const name of raw) {
      if (validTeams.includes(name) && !seen.has(name)) {
        seen.add(name);
        ordered.push(name);
        if (ordered.length >= MAX_RANK) break;
      }
    }

    if (ordered.length > 0) clean[code] = ordered;
  }

  return clean;
}

/**
 * Load the signed-in user's saved bracket. Returns {} when there is no row yet.
 * RLS guarantees a user can only ever read their own row.
 */
export async function loadPicks(supabase, userId) {
  if (!supabase || !userId) return {};

  const { data, error } = await supabase
    .from('brackets')
    .select('picks')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return validatePicks(data?.picks ?? {});
}

/**
 * Upsert the user's bracket. Returns the cleaned picks that were persisted.
 * RLS guarantees a user can only ever write their own row.
 */
export async function savePicks(supabase, userId, picks) {
  if (!supabase) throw new Error('Supabase client is required');
  if (!userId) throw new Error('You must be signed in to save');

  const clean = validatePicks(picks);

  const { error } = await supabase
    .from('brackets')
    .upsert(
      { user_id: userId, picks: clean, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );

  if (error) throw error;
  return clean;
}
