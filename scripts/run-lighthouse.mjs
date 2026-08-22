/**
 * Build -> serve dist -> run Lighthouse (headless Chrome) -> verify PWA installability + offline.
 *
 * NOTE: Lighthouse >= 12 removed the dedicated "PWA" category and its
 * installability/offline audits. So this script:
 *   1. Runs Lighthouse for the standard quality scores (performance, a11y, ...).
 *   2. Verifies PWA *installability* + *offline* explicitly against the served
 *      build — the same criteria Lighthouse's old PWA audits used:
 *        - a valid installable manifest (name, start_url, standalone, 192+512 + maskable icons),
 *        - a reachable service worker,
 *        - a non-empty Workbox precache that includes the app shell (html/js/css/icons).
 *
 * Exits non-zero if installability or the offline precache checks fail.
 * Run: `npm run lighthouse`
 */

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4178;
const URL = `http://localhost:${PORT}/`;

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exitCode = 1;
}

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Preview server did not start at ${url} within ${timeoutMs}ms`);
}

/** Build the app (fresh dist). Throws on build failure. Does NOT scrape the
 *  build log — the precache count is derived from dist/sw.js in checkOffline(). */
function build() {
  console.log('› Building (base=/)…');
  const res = spawnSync('npm', ['run', 'build'], { cwd: ROOT, encoding: 'utf8' });
  if (res.status !== 0) {
    console.error(`${res.stdout ?? ''}${res.stderr ?? ''}`);
    throw new Error('Build failed');
  }
}

/** Validate the served manifest represents an installable PWA. */
async function checkInstallable() {
  const problems = [];
  const res = await fetch(`${URL}manifest.webmanifest`);
  if (!res.ok) return { ok: false, problems: ['manifest.webmanifest not reachable'] };
  const m = await res.json();

  if (!m.name && !m.short_name) problems.push('missing name/short_name');
  if (!m.start_url) problems.push('missing start_url');
  if (m.display !== 'standalone' && m.display !== 'fullscreen' && m.display !== 'minimal-ui') {
    problems.push(`display "${m.display}" is not app-like`);
  }
  const icons = Array.isArray(m.icons) ? m.icons : [];
  const has = (px) => icons.some((i) => String(i.sizes ?? '').includes(px));
  if (!has('192')) problems.push('no 192px icon');
  if (!has('512')) problems.push('no 512px icon');
  if (!icons.some((i) => String(i.purpose ?? '').includes('maskable'))) {
    problems.push('no maskable icon');
  }

  // Service worker must be reachable and the HTML must link the manifest.
  const sw = await fetch(`${URL}sw.js`);
  if (!sw.ok) problems.push('sw.js not reachable');
  const html = await (await fetch(URL)).text();
  if (!/rel="manifest"/.test(html)) problems.push('index.html does not link the manifest');

  return { ok: problems.length === 0, problems, manifest: m };
}

/** Confirm the offline precache includes the app shell. The precache list — and
 *  its count — is read straight from dist/sw.js (the source of truth), not from
 *  the build log, so it survives build-tool output-format changes. */
function checkOffline() {
  const problems = [];
  let sw = '';
  try {
    sw = readFileSync(join(ROOT, 'dist', 'sw.js'), 'utf8');
  } catch {
    problems.push('dist/sw.js not found');
  }
  const urls = [...sw.matchAll(/url:\s*"([^"]+)"/g)].map((x) => x[1]);
  const count = urls.length;
  if (count <= 0) problems.push('Workbox precache is empty');
  const joined = urls.join('\n');
  if (!/index\.html/.test(joined)) problems.push('index.html not precached');
  if (!/\.js/.test(joined)) problems.push('no JS precached');
  if (!/\.css/.test(joined)) problems.push('no CSS precached');
  if (!/icon-512\.png/.test(joined)) problems.push('icons not precached');
  return { ok: problems.length === 0, problems, count, urls };
}

async function main() {
  build();

  console.log('› Starting preview server…');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });

  let chrome;
  try {
    await waitForServer(URL);

    console.log('› Launching headless Chrome + Lighthouse…');
    // --no-sandbox lets Chrome launch as root in CI containers. It's safe here
    // because this script only ever loads our own freshly-built localhost preview,
    // never untrusted content. Don't reuse this flag to browse arbitrary pages.
    chrome = await launch({ chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'] });
    const runner = await lighthouse(URL, { port: chrome.port, output: 'json', logLevel: 'error' });
    const lhr = runner.lhr;

    // A Lighthouse runtimeError (e.g. NO_FCP) leaves every category score null.
    // Surface it loudly and fail the run — silently printing "n/a" is exactly what
    // let the NO_FCP first-paint regression slip through unnoticed.
    const runtimeError = lhr.runtimeError;
    if (runtimeError) {
      fail(`Lighthouse runtime error [${runtimeError.code}]: ${runtimeError.message}`);
      console.error('   → category scores are unavailable for this run.');
    }

    console.log('\n=== Lighthouse categories ===');
    if (runtimeError) {
      console.log('  (unavailable — see the runtime error above)');
    } else {
      for (const cat of Object.values(lhr.categories)) {
        const pct = cat.score == null ? 'n/a' : `${Math.round(cat.score * 100)}`;
        console.log(`  ${cat.title.padEnd(16)} ${pct}`);
      }
    }

    console.log('\n=== PWA installability (explicit) ===');
    const inst = await checkInstallable();
    if (inst.ok) console.log('  ✅ installable manifest + reachable service worker');
    else inst.problems.forEach((p) => console.log(`  ✗ ${p}`));

    console.log('\n=== Offline capability (precache) ===');
    const off = checkOffline();
    if (off.ok) console.log(`  ✅ offline-ready: ${off.count} assets precached (html, js, css, icons)`);
    else off.problems.forEach((p) => console.log(`  ✗ ${p}`));

    // === Budget gates (fail the run, don't just report) ===
    console.log('\n=== Budgets ===');
    const BUDGETS = { perfScore: 95, precacheKB: 150, mainJsGzKB: 25 };

    // Performance score.
    if (!runtimeError) {
      const perf = lhr.categories.performance?.score;
      const perfPct = perf == null ? null : Math.round(perf * 100);
      if (perfPct != null && perfPct >= BUDGETS.perfScore) {
        console.log(`  ✅ performance ${perfPct} ≥ ${BUDGETS.perfScore}`);
      } else {
        fail(`performance ${perfPct ?? 'n/a'} < ${BUDGETS.perfScore}`);
      }
    }

    // Workbox precache total (raw bytes of every precached file).
    const precacheBytes = off.urls.reduce((sum, u) => {
      try {
        return sum + statSync(join(ROOT, 'dist', u.replace(/^\//, ''))).size;
      } catch {
        return sum;
      }
    }, 0);
    const precacheKB = Math.round(precacheBytes / 1024);
    if (precacheKB <= BUDGETS.precacheKB) {
      console.log(`  ✅ precache ${precacheKB} KB ≤ ${BUDGETS.precacheKB} KB (${off.count} assets)`);
    } else {
      fail(`Workbox precache ${precacheKB} KB > ${BUDGETS.precacheKB} KB`);
    }

    // Main app JS bundle, gzipped.
    let mainJsGzKB = null;
    try {
      const assetsDir = join(ROOT, 'dist', 'assets');
      const mainJs = readdirSync(assetsDir).find((f) => /^index-.*\.js$/.test(f));
      if (mainJs) mainJsGzKB = Math.round(gzipSync(readFileSync(join(assetsDir, mainJs))).length / 1024);
    } catch {
      // fall through to the not-found failure below
    }
    if (mainJsGzKB == null) {
      fail('main app JS bundle not found in dist/assets');
    } else if (mainJsGzKB <= BUDGETS.mainJsGzKB) {
      console.log(`  ✅ main JS ${mainJsGzKB} KB gz ≤ ${BUDGETS.mainJsGzKB} KB`);
    } else {
      fail(`main JS ${mainJsGzKB} KB gz > ${BUDGETS.mainJsGzKB} KB`);
    }

    if (!inst.ok) fail('PWA installability check failed');
    if (!off.ok) fail('Offline precache check failed');
    if (process.exitCode !== 1) {
      console.log('\n✅ PASS — installable + offline-capable PWA, within budgets.');
    }
  } finally {
    if (chrome) await chrome.kill();
    preview.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
