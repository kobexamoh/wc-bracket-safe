/**
 * Login-hero pitch: a ball bounces between two stationary lineups
 * (bears 4-3-3 vs pandas 4-2-3-1). The physics step is pure (unit-tested);
 * mountBallChase wires requestAnimationFrame + a11y guards.
 *
 * Easter egg (desktop Konami → bear scores): reserved for a hands-on build —
 * the pitch, goals, and a hidden `.login-hero__scorer` span are ready to hook up.
 */

import { prefersReducedMotion } from './celebrate.js';

/** FIFA pitch ratio (length : width = 105 : 68). */
export const PITCH_RATIO = 105 / 68;

export const DEFAULT_BALL_RADIUS = 8;
export const DEFAULT_BALL_SPEED = 185;
export const GOAL_MOUTH_RATIO = { top: 0.36, bottom: 0.64 };

/**
 * Normalized pitch coordinates (0–1). Bears defend left; pandas defend right.
 * Bears: 4-3-3. Pandas: 4-2-3-1.
 */
export const FORMATION_BEAR_433 = [
  { x: 0.06, y: 0.5, emoji: '🐻' }, // GK
  { x: 0.17, y: 0.18, emoji: '🐻' },
  { x: 0.17, y: 0.38, emoji: '🐻' },
  { x: 0.17, y: 0.62, emoji: '🐻' },
  { x: 0.17, y: 0.82, emoji: '🐻' },
  { x: 0.3, y: 0.25, emoji: '🐻' },
  { x: 0.3, y: 0.5, emoji: '🐻' },
  { x: 0.3, y: 0.75, emoji: '🐻' },
  { x: 0.42, y: 0.2, emoji: '🐻' },
  { x: 0.42, y: 0.5, emoji: '🐻' },
  { x: 0.42, y: 0.82, emoji: '🐻' },
];

export const FORMATION_PANDA_4231 = [
  { x: 0.94, y: 0.5, emoji: '🐼' }, // GK
  { x: 0.83, y: 0.18, emoji: '🐼' },
  { x: 0.83, y: 0.38, emoji: '🐼' },
  { x: 0.83, y: 0.62, emoji: '🐼' },
  { x: 0.83, y: 0.82, emoji: '🐼' },
  { x: 0.7, y: 0.38, emoji: '🐼' },
  { x: 0.7, y: 0.62, emoji: '🐼' },
  { x: 0.58, y: 0.2, emoji: '🐼' },
  { x: 0.58, y: 0.5, emoji: '🐼' },
  { x: 0.58, y: 0.8, emoji: '🐼' },
  { x: 0.5, y: 0.5, emoji: '🐼' },
];

/** @typedef {{ x: number, y: number, vx: number, vy: number, radius: number }} BallState */
/** @typedef {{ width: number, height: number, ball: BallState }} PitchState */

export function buildFormationPlayers() {
  return [...FORMATION_BEAR_433, ...FORMATION_PANDA_4231];
}

export function isInGoalMouth(y, height, mouth = GOAL_MOUTH_RATIO) {
  const norm = y / height;
  return norm >= mouth.top && norm <= mouth.bottom;
}

export function createInitialState(width, height, options = {}) {
  const radius = options.ballRadius ?? DEFAULT_BALL_RADIUS;
  const speed = options.ballSpeed ?? DEFAULT_BALL_SPEED;
  const angle = options.seedAngle ?? Math.PI / 3;
  const safeW = Math.max(width, radius * 4);
  const safeH = Math.max(height, radius * 4);
  return {
    width: safeW,
    height: safeH,
    ball: {
      x: safeW * 0.5,
      y: safeH * 0.5,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius,
    },
  };
}

export function createStaticState(width, height, options = {}) {
  const state = createInitialState(width, height, { ...options, ballSpeed: 0 });
  state.ball.vx = 0;
  state.ball.vy = 0;
  state.ball.x = width * 0.5;
  state.ball.y = height * 0.5;
  return state;
}

/** Advance play by dt seconds. Ball reflects off the touchlines. */
export function stepPitch(state, dtSeconds) {
  const { width, height, ball } = state;
  let { x, y, vx, vy, radius } = ball;

  x += vx * dtSeconds;
  y += vy * dtSeconds;

  if (x - radius < 0) {
    x = radius;
    vx = Math.abs(vx);
  } else if (x + radius > width) {
    x = width - radius;
    vx = -Math.abs(vx);
  }

  if (y - radius < 0) {
    y = radius;
    vy = Math.abs(vy);
  } else if (y + radius > height) {
    y = height - radius;
    vy = -Math.abs(vy);
  }

  return {
    width,
    height,
    ball: { x, y, vx, vy, radius },
  };
}

export const stepBallChase = stepPitch;

function readStageSize(stageEl) {
  const rect = stageEl.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

function placeBall(ballEl, ball, playerSize) {
  const offset = playerSize * 0.45;
  ballEl.style.transform = `translate(${ball.x - offset}px, ${ball.y - offset}px)`;
}

function renderPlayers(playersEl, formation, width, height) {
  playersEl.replaceChildren();
  formation.forEach((spot) => {
    const el = document.createElement('span');
    el.className = 'login-hero__player';
    el.textContent = spot.emoji;
    el.setAttribute('aria-hidden', 'true');
    const offset = 7;
    el.style.transform = `translate(${spot.x * width - offset}px, ${spot.y * height - offset}px)`;
    playersEl.appendChild(el);
  });
}

/** Mount the pitch animation. Returns an unmount function. */
export function mountBallChase(frameEl, options = {}) {
  const stageEl = frameEl.querySelector('.login-hero__stage');
  const playersEl = frameEl.querySelector('.login-hero__players');
  const ballEl = frameEl.querySelector('.login-hero__ball');
  if (!stageEl || !playersEl || !ballEl) return () => {};

  const win = options.window ?? (typeof window !== 'undefined' ? window : undefined);
  const doc = options.document ?? (typeof document !== 'undefined' ? document : undefined);
  const reducedMotion = options.reducedMotion ?? prefersReducedMotion(win);
  const formation = options.formation ?? buildFormationPlayers();

  let state = null;
  let rafId = null;
  let lastTs = null;
  let running = !reducedMotion;

  function syncLayout() {
    const { width, height } = readStageSize(stageEl);
    renderPlayers(playersEl, formation, width, height);
    if (!state || state.width !== width || state.height !== height) {
      state = reducedMotion
        ? createStaticState(width, height, options)
        : createInitialState(width, height, options);
    }
    placeBall(ballEl, state.ball, 16);
  }

  function tick(ts) {
    if (!running) return;
    if (lastTs == null) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    state = stepPitch(state, dt);
    placeBall(ballEl, state.ball, 16);
    rafId = win.requestAnimationFrame(tick);
  }

  function start() {
    if (reducedMotion || running) return;
    running = true;
    lastTs = null;
    rafId = win.requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (rafId != null) {
      win.cancelAnimationFrame(rafId);
      rafId = null;
    }
    lastTs = null;
  }

  function onVisibility() {
    if (!doc) return;
    if (doc.visibilityState === 'hidden') stop();
    else start();
  }

  syncLayout();

  const resizeObserver =
    typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => syncLayout()) : null;
  if (resizeObserver) resizeObserver.observe(stageEl);
  else if (win) win.addEventListener('resize', syncLayout);

  if (!reducedMotion && win) {
    doc?.addEventListener('visibilitychange', onVisibility);
    start();
  }

  return function unmountBallChase() {
    stop();
    if (resizeObserver) resizeObserver.disconnect();
    else if (win) win.removeEventListener('resize', syncLayout);
    doc?.removeEventListener('visibilitychange', onVisibility);
  };
}
