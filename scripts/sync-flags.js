/**
 * Vendor the flag assets this app uses from the `flag-icons` devDependency into
 * `public/flags/`, kept in sync with the team list so we never ship 250+ unused
 * files. For each used code we write BOTH:
 *   - `<code>.svg` — crisp vector, used by the live UI.
 *   - `<code>.png` — a raster (via @resvg/resvg-js) used by the screenshot
 *     export, because html2canvas can't reliably rasterize SVG-in-canvas on
 *     iOS/iPadOS WebKit (it mis-sizes them to a coloured corner); a PNG renders
 *     identically on every engine.
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

import { Resvg } from '@resvg/resvg-js';

import { getAllFlagCodes } from '../src/js/bracketData.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const srcDir = join(root, 'node_modules', 'flag-icons', 'flags', '4x3');
const destDir = join(root, 'public', 'flags');

// Rasterize one flag SVG to a PNG buffer at a fixed display width (4x3 aspect
// preserved). 128px stays crisp at the small export size (~44px at scale 2).
function svgToPng(svg) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: 128 } }).render().asPng();
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
    await writeFile(join(destDir, `${code}.svg`), svg);       // live UI (vector)
    await writeFile(join(destDir, `${code}.png`), svgToPng(svg)); // export (raster)
  }

  if (missing.length) {
    throw new Error(`No flag-icons SVG for: ${missing.join(', ')}`);
  }

  const files = await readdir(destDir);
  const svgCount = files.filter((f) => f.endsWith('.svg')).length;
  const pngCount = files.filter((f) => f.endsWith('.png')).length;
  console.log(`Synced ${svgCount} SVG + ${pngCount} PNG flags to public/flags/`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
