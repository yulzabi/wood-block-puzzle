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
import { readFileSync } from 'node:fs';
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

/** Build the app and return the reported Workbox precache entry count. */
function build() {
  console.log('› Building (base=/)…');
  const res = spawnSync('npm', ['run', 'build'], { cwd: ROOT, encoding: 'utf8' });
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  if (res.status !== 0) {
    console.error(out);
    throw new Error('Build failed');
  }
  const m = out.match(/precache\s+(\d+)\s+entries/i);
  return m ? Number(m[1]) : 0;
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

/** Confirm the offline precache includes the app shell. */
function checkOffline(precacheCount) {
  const problems = [];
  if (precacheCount <= 0) problems.push('Workbox precache is empty');
  let sw = '';
  try {
    sw = readFileSync(join(ROOT, 'dist', 'sw.js'), 'utf8');
  } catch {
    problems.push('dist/sw.js not found');
  }
  const urls = [...sw.matchAll(/url:\s*"([^"]+)"/g)].map((x) => x[1]);
  const joined = urls.join('\n');
  if (!/index\.html/.test(joined)) problems.push('index.html not precached');
  if (!/\.js/.test(joined)) problems.push('no JS precached');
  if (!/\.css/.test(joined)) problems.push('no CSS precached');
  if (!/icon-512\.png/.test(joined)) problems.push('icons not precached');
  return { ok: problems.length === 0, problems, count: precacheCount, urls };
}

async function main() {
  const precacheCount = build();

  console.log('› Starting preview server…');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });

  let chrome;
  try {
    await waitForServer(URL);

    console.log('› Launching headless Chrome + Lighthouse…');
    chrome = await launch({ chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'] });
    const runner = await lighthouse(URL, { port: chrome.port, output: 'json', logLevel: 'error' });
    const lhr = runner.lhr;

    console.log('\n=== Lighthouse categories ===');
    for (const cat of Object.values(lhr.categories)) {
      const pct = cat.score == null ? 'n/a' : `${Math.round(cat.score * 100)}`;
      console.log(`  ${cat.title.padEnd(16)} ${pct}`);
    }

    console.log('\n=== PWA installability (explicit) ===');
    const inst = await checkInstallable();
    if (inst.ok) console.log('  ✅ installable manifest + reachable service worker');
    else inst.problems.forEach((p) => console.log(`  ✗ ${p}`));

    console.log('\n=== Offline capability (precache) ===');
    const off = checkOffline(precacheCount);
    if (off.ok) console.log(`  ✅ offline-ready: ${off.count} assets precached (html, js, css, icons)`);
    else off.problems.forEach((p) => console.log(`  ✗ ${p}`));

    if (!inst.ok) fail('PWA installability check failed');
    if (!off.ok) fail('Offline precache check failed');
    if (process.exitCode !== 1) {
      console.log('\n✅ PASS — installable + offline-capable PWA.');
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
