/**
 * Bracket image export.
 *
 * Builds a purpose-made, off-screen "branded card" (a title bar + the 12-group
 * grid) and downloads it as a PNG. The card is rendered fresh from state via
 * renderBracket() rather than screenshotting the live UI, so the export never
 * picks up the sticky toolbar or the fixed feedback button, and is unaffected
 * by scroll position or viewport size.
 *
 * Dependencies (the html2canvas loader and `document`) are injected with
 * call-time defaults, so importing this module never touches the DOM or pulls
 * in html2canvas — keeping it unit-test friendly and out of the initial bundle.
 */

import { renderBracket } from './bracketData.js';
import { renderKnockoutTree } from './knockoutRender.js';
import { drawBracketConnectors } from './bracketConnectors.js';

const EXPORT_WIDTH = 1024;
const KNOCKOUT_EXPORT_WIDTH = 1920;
const KNOCKOUT_EXPORT_PAD = 48;

/** Dated, collision-resistant filename, e.g. `wc-bracket-2026-06-17.png`. */
export function screenshotFilename(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `wc-bracket-${year}-${month}-${day}.png`;
}

/** Slug for filenames: lowercase, keep [a-z0-9], collapse the rest to single dashes, trim. */
function nameSlug(name = '') {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Card title, e.g. "Kobe's D+C World Cup Bracket" (neutral fallback when blank). */
export function personalizedTitle(name = '') {
  const trimmed = String(name).trim();
  return trimmed ? `${trimmed}'s D+C World Cup Bracket` : 'My D+C World Cup Bracket';
}

/** Filename, name-prefixed when given, e.g. `amoh-wc-bracket-2026-06-17.png`. */
export function personalizedFilename(name = '', date = new Date()) {
  const base = screenshotFilename(date);
  const slug = nameSlug(name);
  return slug ? `${slug}-${base}` : base;
}

/** Card title for the official (real-results) knockout bracket export. */
export function officialBracketTitle(name = '') {
  const trimmed = String(name).trim();
  return trimmed ? `${trimmed}'s Official WC Bracket` : 'My Official WC Bracket';
}

/** Dated filename for the official bracket PNG, e.g. `amoh-official-wc-bracket-2026-07-06.png`. */
export function officialBracketFilename(name = '', date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const base = `official-wc-bracket-${year}-${month}-${day}.png`;
  const slug = nameSlug(name);
  return slug ? `${slug}-${base}` : base;
}

// Lazy-load html2canvas only when an export actually happens, so it stays out
// of the initial bundle (Vite code-splits it into its own chunk).
async function defaultLoadHtml2canvas() {
  const mod = await import('html2canvas');
  return mod.default || mod;
}

function buildExportNode(doc, picks, width, title) {
  const node = doc.createElement('div');
  node.className = 'bracket-export';
  node.style.width = `${width}px`;

  // Build the header with DOM APIs and set the (user-derived) title via
  // textContent, so a name can never inject markup into the export.
  const head = doc.createElement('div');
  head.className = 'bracket-export__head';
  const heading = doc.createElement('h2');
  heading.textContent = title;
  const brand = doc.createElement('span');
  brand.textContent = 'wc.kobexamoh.me';
  head.appendChild(heading);
  head.appendChild(brand);
  node.appendChild(head);

  // renderBracket() returns trusted markup built from the known team list.
  // Hide the per-group Clear control (useless in a static screenshot) and use
  // PNG flags (flagExt:'png') — html2canvas can't reliably rasterize SVG flags
  // on iOS/iPadOS WebKit, but PNGs render identically on every engine.
  node.insertAdjacentHTML('beforeend', renderBracket(picks, { showClearButtons: false, flagExt: 'png' }));
  return node;
}

function buildKnockoutExportNode(doc, bracket, winners, lockedMatches, width, title) {
  const node = doc.createElement('div');
  node.className = 'bracket-export bracket-export--knockout';
  node.style.width = `${width}px`;

  const head = doc.createElement('div');
  head.className = 'bracket-export__head';
  const heading = doc.createElement('h2');
  heading.textContent = title;
  const brand = doc.createElement('span');
  brand.textContent = 'wc.kobexamoh.me';
  head.appendChild(heading);
  head.appendChild(brand);
  node.appendChild(head);

  node.insertAdjacentHTML('beforeend', renderKnockoutTree(bracket, winners, {
    lockedMatches,
    flagExt: 'png',
    hidePodiumCta: true,
    hideScrollHint: true,
  }));
  return node;
}

/**
 * Grow the export card to the knockout tree's natural width so html2canvas
 * doesn't clip the right half (common at a fixed 1920px on dense layouts).
 */
function fitKnockoutExportWidth(node, minWidth) {
  const bracket = node.querySelector('.knockout-bracket');
  if (!bracket) return minWidth;
  const contentWidth = Math.ceil(bracket.scrollWidth) + KNOCKOUT_EXPORT_PAD;
  const fitted = Math.max(minWidth, contentWidth);
  node.style.width = `${fitted}px`;
  return fitted;
}

/**
 * Resolve once every <img> in the node has finished loading (or errored), so the
 * off-screen flag images are actually painted before html2canvas rasterizes the
 * card. The flags are same-origin (served from /flags), so this is a timing
 * guard, not a CORS one. A per-image timeout makes sure a stuck request can
 * never block the download forever.
 */
function waitForImages(node, timeoutMs = 5000) {
  const imgs = Array.from(node.querySelectorAll('img'));
  return Promise.all(
    imgs.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
        setTimeout(resolve, timeoutMs);
      });
    })
  );
}

/**
 * Render the branded bracket card off-screen and trigger a PNG download.
 * Returns the filename used. Throws if the canvas can't be produced.
 */
export async function downloadBracketImage(picks, options = {}) {
  const {
    loadHtml2canvas = defaultLoadHtml2canvas,
    doc = document,
    name = '',
    title = personalizedTitle(name),
    filename = personalizedFilename(name),
    width = EXPORT_WIDTH,
  } = options;

  const node = buildExportNode(doc, picks, width, title);
  doc.body.appendChild(node);

  try {
    await waitForImages(node); // make sure the flag images are painted before capture
    const html2canvas = await loadHtml2canvas();
    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: '#ffffff',
      windowWidth: width,
      useCORS: true,
      logging: false,
    });

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not render the bracket image');

    const url = URL.createObjectURL(blob);
    const link = doc.createElement('a');
    link.href = url;
    link.download = filename;
    doc.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    return filename;
  } finally {
    node.remove();
  }
}

/**
 * Render the official knockout bracket off-screen and trigger a PNG download.
 * Returns the filename used. Throws if the canvas can't be produced.
 */
export async function downloadOfficialKnockoutImage(bracket, winners, lockedMatches, options = {}) {
  const {
    loadHtml2canvas = defaultLoadHtml2canvas,
    doc = document,
    name = '',
    title = officialBracketTitle(name),
    filename = officialBracketFilename(name),
    width: requestedWidth = KNOCKOUT_EXPORT_WIDTH,
  } = options;

  const node = buildKnockoutExportNode(doc, bracket, winners, lockedMatches, requestedWidth, title);
  doc.body.appendChild(node);

  try {
    await waitForImages(node);
    // Layout must settle before measuring width / drawing connector arms.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const width = fitKnockoutExportWidth(node, requestedWidth);
    drawBracketConnectors(node.querySelector('.knockout-bracket'));

    const html2canvas = await loadHtml2canvas();
    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: '#ffffff',
      windowWidth: width,
      width,
      useCORS: true,
      logging: false,
    });

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not render the bracket image');

    const url = URL.createObjectURL(blob);
    const link = doc.createElement('a');
    link.href = url;
    link.download = filename;
    doc.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    return filename;
  } finally {
    node.remove();
  }
}
