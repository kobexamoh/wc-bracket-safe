/**
 * Real FIFA World Cup 2026 results.
 *
 * This is the single file Kobe updates as real matches finish. Commit + push
 * to Vercel and everyone sees the updated locked matches on refresh.
 *
 * Team names MUST match bracketData.js exactly (e.g. "Ivory Coast" not
 * "Côte d'Ivoire", "United States" not "USA", "Cape Verde" not "Cabo Verde").
 *
 * HOW TO ADD A RESULT:
 *   1. Find the match ID on the bracket view (e.g. M89).
 *   2. Add a line to REAL_MATCH_WINNERS: 'M89': 'France',
 *   3. Commit, push, Vercel redeploys, done.
 */

/**
 * Final group standings — finishing order (1st through 4th) per group.
 * Used to seed the R32 bracket in place of personal predictions.
 */
export const REAL_GROUP_STANDINGS = {
  A: ['Mexico', 'South Africa', 'South Korea', 'Czech Rep.'],
  B: ['Switzerland', 'Canada', 'Bosnia & Herz.', 'Qatar'],
  C: ['Brazil', 'Morocco', 'Scotland', 'Haiti'],
  D: ['United States', 'Australia', 'Paraguay', 'Turkey'],
  E: ['Germany', 'Ivory Coast', 'Ecuador', 'Curaçao'],
  F: ['Netherlands', 'Japan', 'Sweden', 'Tunisia'],
  G: ['Belgium', 'Egypt', 'Iran', 'New Zealand'],
  H: ['Spain', 'Cape Verde', 'Uruguay', 'Saudi Arabia'],
  I: ['France', 'Norway', 'Senegal', 'Iraq'],
  J: ['Argentina', 'Austria', 'Algeria', 'Jordan'],
  K: ['Colombia', 'Portugal', 'DR Congo', 'Uzbekistan'],
  L: ['England', 'Croatia', 'Ghana', 'Panama'],
};

/** The 8 third-place groups that advanced to the Round of 32. */
export const QUALIFYING_THIRD_GROUPS = ['B', 'D', 'E', 'F', 'I', 'J', 'K', 'L'];

/**
 * Match winners from the real tournament, keyed by match ID.
 * Value is the WINNING TEAM NAME (must match bracketData.js).
 *
 * The resolver in realKnockout.js converts these to the 'A'/'B' side format
 * the bracket system uses. Add results round by round — later rounds depend
 * on earlier ones being present.
 *
 * Match IDs: R32 = M73–M88, R16 = M89–M96, QF = M97–M100,
 *            SF = M101–M102, 3rd = M103, Final = M104.
 */
export const REAL_MATCH_WINNERS = {
  // ── Round of 32 (all completed Jun 28 – Jul 3) ────────────────────
  'M73': 'Canada',           // 1-0 vs South Africa
  'M74': 'Paraguay',         // 1-1 (4-3 pens) vs Germany
  'M75': 'Morocco',          // 1-1 (3-2 pens) vs Netherlands
  'M76': 'Brazil',           // 2-1 vs Japan
  'M77': 'France',           // 3-0 vs Sweden
  'M78': 'Norway',           // 2-1 vs Ivory Coast
  'M79': 'Mexico',           // 2-0 vs Ecuador
  'M80': 'England',          // 2-1 vs DR Congo
  'M81': 'United States',    // 2-0 vs Bosnia & Herz.
  'M82': 'Belgium',          // 3-2 (AET) vs Senegal
  'M83': 'Portugal',         // 2-1 vs Croatia
  'M84': 'Spain',            // 3-0 vs Austria
  'M85': 'Switzerland',      // 2-0 vs Algeria
  'M86': 'Argentina',        // 3-2 (AET) vs Cape Verde
  'M87': 'Colombia',         // 1-0 vs Ghana
  'M88': 'Egypt',            // 1-1 (4-2 pens) vs Australia

  // ── Round of 16 (Jul 4–7) ─────────────────────────────────────────
  'M89': 'France',           // 1-0 vs Paraguay (Jul 4)
  'M90': 'Morocco',          // 3-0 vs Canada (Jul 4)
  'M91': 'Norway',           // 2-1 vs Brazil (Jul 5)
  'M92': 'England',          // 3-2 vs Mexico (Jul 5)
  'M93': 'Spain',            // 1-0 vs Portugal (Jul 6)
  'M94': 'Belgium',          // 4-1 vs United States (Jul 6)
  'M95': 'Argentina',        // 3-2 vs Egypt (Jul 7)
  'M96': 'Switzerland',      // 4-3 pens vs Colombia (Jul 7)

  // ── Quarter-finals (Jul 9–11) ─────────────────────────────────────
  'M97': 'France',           // 2-0 vs Morocco (Jul 9)
  'M98': 'Spain',            // 2-1 vs Belgium (Jul 10)
  'M99': 'England',          // 2-1 vs Norway AET (Jul 11)
  'M100': 'Argentina',       // 3-1 vs Switzerland (Jul 11)

  // ── Semi-finals (Jul 14–15) ───────────────────────────────────────
  'M101': 'Spain',         // 2-0 vs France (Jul 14)
  // 'M102': 'team',

  // ── Third-place match (Jul 18) & Final (Jul 19) ───────────────────
  // 'M103': 'team',
  // 'M104': 'team',
};
