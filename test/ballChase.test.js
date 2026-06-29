import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFormationPlayers,
  createInitialState,
  createStaticState,
  isInGoalMouth,
  stepPitch,
  DEFAULT_BALL_RADIUS,
} from '../src/js/ballChase.js';

const FRAME = { width: 420, height: 272 };

test('buildFormationPlayers fields 22 bears and pandas', () => {
  const players = buildFormationPlayers();
  assert.equal(players.length, 22);
  assert.equal(players.filter((p) => p.emoji === '🐻').length, 11);
  assert.equal(players.filter((p) => p.emoji === '🐼').length, 11);
});

test('createInitialState places a moving ball on the pitch', () => {
  const state = createInitialState(FRAME.width, FRAME.height, { seedAngle: 0 });
  assert.ok(state.ball.vx > 0);
  assert.ok(state.ball.x > 0);
});

test('createStaticState freezes the ball for reduced motion', () => {
  const state = createStaticState(FRAME.width, FRAME.height);
  assert.equal(state.ball.vx, 0);
  assert.equal(state.ball.vy, 0);
});

test('stepPitch reflects the ball off the left wall', () => {
  const state = {
    width: 200,
    height: 200,
    ball: { x: DEFAULT_BALL_RADIUS, y: 100, vx: -80, vy: 40, radius: DEFAULT_BALL_RADIUS },
  };
  const next = stepPitch(state, 0.1);
  assert.ok(next.ball.vx > 0);
  assert.ok(next.ball.x >= DEFAULT_BALL_RADIUS);
});

test('stepPitch reflects the ball off the bottom wall', () => {
  const state = {
    width: 200,
    height: 200,
    ball: { x: 100, y: 200 - DEFAULT_BALL_RADIUS, vx: 30, vy: 90, radius: DEFAULT_BALL_RADIUS },
  };
  const next = stepPitch(state, 0.1);
  assert.ok(next.ball.vy < 0);
});

test('isInGoalMouth detects the central goal band', () => {
  assert.equal(isInGoalMouth(100, 200), true);
  assert.equal(isInGoalMouth(20, 200), false);
});

test('stepPitch preserves frame dimensions', () => {
  const state = createInitialState(FRAME.width, FRAME.height);
  const next = stepPitch(state, 0.25);
  assert.equal(next.width, FRAME.width);
  assert.equal(next.height, FRAME.height);
});
