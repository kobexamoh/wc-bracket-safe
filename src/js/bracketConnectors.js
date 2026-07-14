/**
 * SVG overlay connector arms for the knockout tree.
 *
 * Measure match cards in the live DOM, then draw H/V elbow paths into an
 * absolutely positioned <svg> that sits on top of .knockout-bracket. Pure CSS
 * forks failed across our split left/center/right layout; measuring after
 * layout is reliable.
 */

import { KNOCKOUT_WIRING } from './knockout.js';

/** Edges: each later-round match is fed by two earlier matches. */
export function connectorFeeds() {
  const edges = [];
  for (const round of [KNOCKOUT_WIRING.R16, KNOCKOUT_WIRING.QF, KNOCKOUT_WIRING.SF]) {
    for (const match of round) {
      edges.push({ to: match.id, from: match.from.slice() });
    }
  }
  // Final: winners of both semis (no third-place lines — that match sits below).
  edges.push({ to: 'M104', from: ['M101', 'M102'] });
  return edges;
}

/**
 * Orthogonal elbow arm:
 * from (outbound edge mid) → horizontal to midX → vertical to target Y → horizontal in.
 */
export function elbowPath(from, to) {
  const midX = (from.x + to.x) / 2;
  return `M ${round(from.x)} ${round(from.y)} H ${round(midX)} V ${round(to.y)} H ${round(to.x)}`;
}

function round(n) {
  return Math.round(n * 10) / 10;
}

function edgePoint(rect, rootRect, toward) {
  const midY = rect.top + rect.height / 2 - rootRect.top;
  if (toward === 'right') {
    return { x: rect.right - rootRect.left, y: midY };
  }
  return { x: rect.left - rootRect.left, y: midY };
}

/**
 * Build path `d` strings for every feed edge that has both match cards present.
 * Pure enough to unit-test via elbowPath + connectorFeeds; this helper stays DOM-free
 * given rect lookups.
 */
export function buildConnectorPathData(getRect, rootRect) {
  const paths = [];
  for (const edge of connectorFeeds()) {
    const toRect = getRect(edge.to);
    if (!toRect) continue;
    for (const fromId of edge.from) {
      const fromRect = getRect(fromId);
      if (!fromRect) continue;
      // Outbound edge faces the child (left→right or right→left).
      const feedsFromLeft = fromRect.left + fromRect.width / 2 < toRect.left + toRect.width / 2;
      const from = edgePoint(fromRect, rootRect, feedsFromLeft ? 'right' : 'left');
      const to = edgePoint(toRect, rootRect, feedsFromLeft ? 'left' : 'right');
      paths.push(elbowPath(from, to));
    }
  }
  return paths;
}

/**
 * Measure [data-match] cards inside `bracketRoot` and paint/update the overlay SVG.
 * Safe to call repeatedly after re-renders / resize. No-op when the SVG slot is missing.
 */
export function drawBracketConnectors(bracketRoot) {
  if (!bracketRoot || typeof bracketRoot.querySelector !== 'function') return null;

  const svg = bracketRoot.querySelector('svg.bracket-lines');
  if (!svg) return null;

  const rootRect = bracketRoot.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(bracketRoot.scrollWidth));
  const height = Math.max(1, Math.ceil(bracketRoot.scrollHeight));
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const cardMap = new Map();
  for (const card of bracketRoot.querySelectorAll('article.bracket-match[data-match]')) {
    const id = card.getAttribute('data-match');
    if (id) cardMap.set(id, card.getBoundingClientRect());
  }

  const pathData = buildConnectorPathData((id) => cardMap.get(id) || null, rootRect);
  const d = pathData.join(' ');
  let path = svg.querySelector('path');
  if (!path) {
    path = bracketRoot.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
    svg.appendChild(path);
  }
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'square');
  path.setAttribute('stroke-linejoin', 'miter');
  path.setAttribute('vector-effect', 'non-scaling-stroke');

  return { width, height, pathCount: pathData.length };
}
