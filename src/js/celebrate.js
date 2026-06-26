/**
 * Submit-success celebration (the PR F "moment").
 *
 * Design-engineer notes (meaningful motion, tokens, states, a11y):
 *  - Meaningful motion: a brief two-sided "cannon" burst that punctuates the
 *    app's climactic action (submitting a bracket) and then gets out of the
 *    way — not a continuous, attention-hogging loop.
 *  - Token-driven: the confetti colours are read from the same CSS design
 *    tokens the rest of the UI uses (--ua-green / --ua-gold / --gold), so the
 *    brand stays single-sourced instead of being duplicated as magic hexes.
 *  - Accessible + safe: honours `prefers-reduced-motion`, the canvas never
 *    blocks the dialog (pointer-events stay off), and the library is lazy-
 *    loaded with any failure swallowed — a missing chunk can't break the
 *    (already-completed) submit.
 *
 * Dependencies (the confetti loader, the reduced-motion check, and the colour
 * source) are injected with call-time defaults, so importing this module never
 * touches the DOM or pulls in canvas-confetti — keeping it unit-test friendly
 * and out of the initial bundle (Vite code-splits the dynamic import).
 */

// Brand fallback palette (mirrors the CSS tokens) used when the tokens can't be
// read — e.g. in unit tests, or before styles are applied.
export const CELEBRATION_COLORS = ['#007A33', '#F2CD00', '#ebc574', '#ffffff'];

// Render above the modal layer (`.modal` is z-index 300) so the confetti rains
// over the whole celebratory moment. canvas-confetti's canvas has no pointer
// events, so a higher z-index still never blocks the dialog beneath it.
export const CELEBRATION_Z_INDEX = 2000;

/**
 * The two "side cannon" bursts (left edge + right edge) as plain option
 * objects. Pure and parameterised so the config can be unit-tested without a
 * browser.
 */
export function buildCelebrationBursts(options = {}) {
  const {
    colors = CELEBRATION_COLORS,
    zIndex = CELEBRATION_Z_INDEX,
    particleCount = 45,
    spread = 55,
    startVelocity = 45,
  } = options;
  const base = {
    particleCount,
    spread,
    startVelocity,
    colors,
    zIndex,
    // Belt-and-suspenders: the library also honours reduced motion itself, in
    // case a caller fires a burst without going through `celebrate()`.
    disableForReducedMotion: true,
  };
  return [
    { ...base, angle: 60, origin: { x: 0, y: 0.65 } }, // from the left
    { ...base, angle: 120, origin: { x: 1, y: 0.65 } }, // from the right
  ];
}

/** True when the user has asked the OS for reduced motion (guarded for non-DOM envs). */
export function prefersReducedMotion(win = typeof window !== 'undefined' ? window : undefined) {
  try {
    return Boolean(
      win &&
        typeof win.matchMedia === 'function' &&
        win.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

/**
 * Resolve the brand colours from the live CSS custom properties so the confetti
 * tracks the design tokens. Falls back to the constant palette when the tokens
 * (or the DOM) aren't available.
 */
export function readBrandColors(doc = typeof document !== 'undefined' ? document : undefined) {
  try {
    if (!doc || typeof getComputedStyle !== 'function') return CELEBRATION_COLORS;
    const styles = getComputedStyle(doc.documentElement);
    const resolved = ['--ua-green', '--ua-gold', '--gold']
      .map((token) => styles.getPropertyValue(token).trim())
      .filter(Boolean);
    resolved.push('#ffffff');
    return resolved.length > 1 ? resolved : CELEBRATION_COLORS;
  } catch {
    return CELEBRATION_COLORS;
  }
}

// Lazy-load canvas-confetti only when a celebration actually happens, so it
// stays out of the initial bundle (Vite code-splits it into its own chunk).
async function defaultLoadConfetti() {
  const mod = await import('canvas-confetti');
  return mod.default || mod;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fire the celebration. Fire-and-forget: resolves once all bursts are queued.
 * No-ops under reduced motion or if the library can't be loaded.
 */
export async function celebrate(options = {}) {
  const {
    loadConfetti = defaultLoadConfetti,
    reducedMotion = prefersReducedMotion(),
    colors = readBrandColors(),
    bursts = buildCelebrationBursts({ colors }),
    cycles = 3,
    intervalMs = 220,
  } = options;

  if (reducedMotion) return; // honour the user's motion preference

  let confetti;
  try {
    confetti = await loadConfetti();
  } catch {
    return; // confetti is a flourish — never let it break the success flow
  }
  if (typeof confetti !== 'function') return;

  // A few quick volleys read as livelier than a single shot, but it's over in
  // well under a second so it never overstays its welcome.
  for (let i = 0; i < cycles; i += 1) {
    bursts.forEach((burst) => confetti(burst));
    if (i < cycles - 1) await delay(intervalMs);
  }
}
