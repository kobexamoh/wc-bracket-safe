import test from 'node:test';
import assert from 'node:assert/strict';
import {
  connectorFeeds,
  elbowPath,
  buildConnectorPathData,
} from '../src/js/bracketConnectors.js';

test('connectorFeeds covers R16 through Final (no third-place)', () => {
  const edges = connectorFeeds();
  assert.equal(edges.length, 8 + 4 + 2 + 1); // R16 + QF + SF + Final
  assert.ok(edges.some((e) => e.to === 'M89' && e.from.includes('M74') && e.from.includes('M77')));
  assert.ok(edges.some((e) => e.to === 'M101' && e.from.includes('M97') && e.from.includes('M98')));
  assert.ok(edges.some((e) => e.to === 'M104' && e.from.includes('M101') && e.from.includes('M102')));
  assert.ok(!edges.some((e) => e.to === 'M103'));
});

test('elbowPath draws H/V/H orthogonal arm', () => {
  assert.equal(
    elbowPath({ x: 100, y: 50 }, { x: 200, y: 150 }),
    'M 100 50 H 150 V 150 H 200',
  );
  assert.equal(
    elbowPath({ x: 200.44, y: 10.11 }, { x: 100.44, y: 40.11 }),
    'M 200.4 10.1 H 150.4 V 40.1 H 100.4',
  );
});

test('buildConnectorPathData joins same-side parents into a shared vertical stem', () => {
  const root = { left: 10, top: 20 };
  const rects = {
    M74: { left: 10, top: 20, width: 100, height: 40, right: 110 },
    M77: { left: 10, top: 120, width: 100, height: 40, right: 110 },
    M89: { left: 170, top: 60, width: 100, height: 40, right: 270 },
  };
  const paths = buildConnectorPathData((id) => rects[id] || null, root);
  assert.equal(paths.length, 2);
  // from.right mid → child.left mid; meetY = child midY = 60
  assert.equal(paths[0], 'M 100 20 H 130 V 60 H 160');
  assert.equal(paths[1], 'M 100 120 H 130 V 60 H 160');
});

test('buildConnectorPathData skips edges when a card is missing', () => {
  const root = { left: 0, top: 0 };
  const paths = buildConnectorPathData(() => null, root);
  assert.equal(paths.length, 0);
});
