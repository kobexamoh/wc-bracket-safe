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

const EXPORT_WIDTH = 1024;

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
  // Hide the per-group Clear control — it isn't useful in a static screenshot.
  node.insertAdjacentHTML('beforeend', renderBracket(picks, { showClearButtons: false }));
  return node;
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
    const html2canvas = await loadHtml2canvas();
    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: '#ffffff',
      windowWidth: width,
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
