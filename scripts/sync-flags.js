/**
 * Copy only the flag SVGs this app actually uses from the `flag-icons`
 * devDependency into `public/flags/`, so the committed assets stay in sync with
 * the team list and we never vendor 250+ unused files.
 *
 * Source of truth for which flags to copy is `getAllFlagCodes()` in
 * bracketData.js, so adding/removing a team automatically changes what's synced.
 * Uses the 4x3 (rectangular) set to match the previous emoji shape.
 *
 * Run: `npm run flags:sync`
 */

import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { getAllFlagCodes } from '../src/js/bracketData.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const srcDir = join(root, 'node_modules', 'flag-icons', 'flags', '4x3');
const destDir = join(root, 'public', 'flags');

// html2canvas can't scale a "responsive" SVG (one with a viewBox but no width/
// height attributes): it draws the flag at its natural 640x480 size pinned to
// the top-left corner, so the PNG export shows only a sliver. Giving every flag
// an explicit width/height (taken from its viewBox) fixes the export, while the
// live UI keeps sizing flags via CSS. See html2canvas issues #1803 / #1897.
function ensureIntrinsicSize(svg) {
  if (/<svg[^>]*\swidth=/.test(svg)) return svg; // already sized
  const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!vb) return svg;
  const [, w, h] = vb;
  return svg.replace(/<svg\b/, `<svg width="${w}" height="${h}"`);
}

async function main() {
  if (!existsSync(srcDir)) {
    throw new Error(`flag-icons not found at ${srcDir} — run \`npm install\` first.`);
  }

  // Unique codes, sorted for a stable, reviewable diff.
  const codes = [...new Set(getAllFlagCodes())].sort();

  // Start clean so a removed team can't leave an orphaned flag behind.
  await rm(destDir, { recursive: true, force: true });
  await mkdir(destDir, { recursive: true });

  const missing = [];
  for (const code of codes) {
    const from = join(srcDir, `${code}.svg`);
    if (!existsSync(from)) {
      missing.push(code);
      continue;
    }
    const svg = await readFile(from, 'utf8');
    await writeFile(join(destDir, `${code}.svg`), ensureIntrinsicSize(svg));
  }

  if (missing.length) {
    throw new Error(`No flag-icons SVG for: ${missing.join(', ')}`);
  }

  const written = (await readdir(destDir)).filter((f) => f.endsWith('.svg'));
  console.log(`Synced ${written.length} flag SVGs to public/flags/`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
