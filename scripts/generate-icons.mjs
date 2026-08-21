/**
 * Generate wood-themed PWA icons + an iOS splash image from an inline SVG source.
 *
 * Produces (into public/icons/):
 *   icon-192.png            192  "any"      rounded plaque
 *   icon-512.png            512  "any"      rounded plaque
 *   icon-512-maskable.png   512  "maskable" full-bleed, motif inside the safe zone
 *   apple-touch-icon-180.png 180 iOS        full-bleed (iOS applies its own mask)
 *   splash.png              1290x2796       generic iOS launch image (fallback)
 *   splash-<w>x<h>.png      per device      iOS launch images at exact device pixel
 *                                           sizes (iOS only shows a launch image on
 *                                           an exact device-width/height/DPR match)
 *
 * Run: `npm run icons`
 */

import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

// Wood tones for the icon tiles — a hand-picked subset of the theme palette
// (src/styles/theme.css --wood-1..6), kept in sync manually. If you retheme the
// blocks, update these too so the icon doesn't drift from the in-game look.
const TILES = ['#d9a066', '#c8894e', '#b06f39', '#9a5a2c'];

/** One rounded, top-highlighted wood tile. */
function tile(x, y, s, color) {
  const r = (s * 0.22).toFixed(2);
  const f = (n) => n.toFixed(2);
  return (
    `<g>` +
    `<rect x="${f(x)}" y="${f(y)}" width="${f(s)}" height="${f(s)}" rx="${r}" fill="${color}"/>` +
    `<rect x="${f(x)}" y="${f(y)}" width="${f(s)}" height="${f(s * 0.46)}" rx="${r}" fill="#ffffff" fill-opacity="0.18"/>` +
    `</g>`
  );
}

/** A 2x2 cluster of wood tiles centered at (cx, cy) fitting inside a `box`-sided square. */
function motif(cx, cy, box) {
  const gap = box * 0.08;
  const s = (box - gap) / 2;
  const x0 = cx - box / 2;
  const y0 = cy - box / 2;
  return [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]
    .map(([c, r], i) => tile(x0 + c * (s + gap), y0 + r * (s + gap), s, TILES[i]))
    .join('');
}

const BG_STOPS = '<stop offset="0" stop-color="#a9713a"/><stop offset="1" stop-color="#5a3d24"/>';

/** A square icon SVG. `rounded` adds app-tile corners; `safe` is the motif box as a fraction of size. */
function iconSVG({ size, rounded, safe }) {
  const r = rounded ? size * 0.22 : 0;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">${BG_STOPS}</linearGradient></defs>` +
    `<rect width="${size}" height="${size}" rx="${r}" fill="url(#bg)"/>` +
    motif(size / 2, size / 2, size * safe) +
    `</svg>`
  );
}

/** Portrait iOS splash: wood backdrop, centered icon plaque, title. */
function splashSVG(w, h) {
  const box = Math.min(w, h) * 0.34;
  const cx = w / 2;
  const cy = h * 0.42;
  const plaque = box * 1.5;
  const pr = plaque * 0.22;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><radialGradient id="bg" cx="50%" cy="35%" r="80%">${BG_STOPS}</radialGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#bg)"/>` +
    `<rect x="${cx - plaque / 2}" y="${cy - plaque / 2}" width="${plaque}" height="${plaque}" rx="${pr}" fill="#5a3d24" fill-opacity="0.55"/>` +
    motif(cx, cy, box) +
    `<text x="${cx}" y="${h * 0.62}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(w * 0.07)}" font-weight="700" fill="#f6ead9">Wood Block Puzzle</text>` +
    `</svg>`
  );
}

async function writePng(svg, file) {
  await sharp(Buffer.from(svg)).png().toFile(join(OUT, file));
  return file;
}

/**
 * iOS launch-image sizes as [physicalW, physicalH, dpr]. iOS only shows a launch
 * image when device-width/height (logical = physical/dpr) and -webkit-device-pixel-
 * ratio all match, so we emit one PNG per common iPhone at its exact device pixels.
 * index.html carries the matching media-query <link>s (+ a generic splash.png).
 * Filenames are splash-<physW>x<physH>.png.
 */
export const IOS_SPLASH = [
  [1290, 2796, 3], // 16/15 Pro Max, 14 Pro Max         (logical 430x932)
  [1179, 2556, 3], // 16/15, 14 Pro                     (logical 393x852)
  [1206, 2622, 3], // 16 Pro                            (logical 402x874)
  [1284, 2778, 3], // 14 Plus, 13/12 Pro Max            (logical 428x926)
  [1170, 2532, 3], // 14/13/12, 13/12 Pro               (logical 390x844)
  [1242, 2688, 3], // 11 Pro Max, XS Max                (logical 414x896)
  [1125, 2436, 3], // 11 Pro, XS, X                     (logical 375x812)
  [828, 1792, 2],  // 11, XR                            (logical 414x896)
  [750, 1334, 2],  // SE (2/3), 8, 7, 6s                (logical 375x667)
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const written = await Promise.all([
    writePng(iconSVG({ size: 192, rounded: true, safe: 0.62 }), 'icon-192.png'),
    writePng(iconSVG({ size: 512, rounded: true, safe: 0.62 }), 'icon-512.png'),
    writePng(iconSVG({ size: 512, rounded: false, safe: 0.5 }), 'icon-512-maskable.png'),
    writePng(iconSVG({ size: 180, rounded: false, safe: 0.6 }), 'apple-touch-icon-180.png'),
    writePng(splashSVG(1290, 2796), 'splash.png'),
    ...IOS_SPLASH.map(([w, h]) => writePng(splashSVG(w, h), `splash-${w}x${h}.png`)),
  ]);
  console.log(`Generated ${written.length} assets in public/icons/:\n  ${written.join('\n  ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
