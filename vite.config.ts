import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// Under Vitest, skip the PWA plugin entirely: its dev service-worker machinery
// has no place in unit tests and running it across Vitest's worker pool stalls
// the transform pipeline. Tests only exercise pure modules under src/.
const isTest = !!process.env.VITEST;

// Warm wood theme colors shared with the PWA manifest.
const THEME_COLOR = '#8a5a2b';
const BACKGROUND_COLOR = '#3b2a1a';

// Base path. Defaults to '/' for local dev/build/Lighthouse and for a
// `<user>.github.io` USER-site repo. For a PROJECT-site repo served at
// `https://<user>.github.io/<repo>/`, the deploy workflow sets
// VITE_BASE=/<repo>/ so all asset URLs, the SW scope, and start_url match.
const BASE = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base: BASE,
  test: {
    // Default env is node (fast); DOM/component tests opt in per-file with a
    // `// @vitest-environment happy-dom` docblock (see src/ui/*.dom.test.ts).
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
      // Exclude tests, type decls, and thin browser-only bootstrap/dev tooling
      // (main.ts registers the SW; perf-probe is a ?perf=1 on-device overlay —
      // neither is unit-testable in isolation).
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/main.ts', 'src/platform/perf-probe.ts'],
      // Floors set just under the measured baseline so they guard against
      // erosion without being instantly red. The pure logic layers carry a
      // much higher bar than the DOM/orchestration layers.
      thresholds: {
        statements: 40,
        branches: 45,
        functions: 38,
        lines: 40,
        'src/core/**': { statements: 95, branches: 88, functions: 100, lines: 95 },
        'src/platform/**': { statements: 85, branches: 78, functions: 95, lines: 88 },
      },
    },
  },
  plugins: isTest ? [] : [
    VitePWA({
      // Prompt (not autoUpdate): a silent swap could reload mid-game and discard
      // the in-progress board. main.ts shows a "Refresh" toast on onNeedRefresh.
      registerType: 'prompt',
      // Exercise the service worker in dev so offline behavior can be validated early.
      devOptions: { enabled: true, type: 'module' },
      // Precache the small home-screen icon in addition to the built JS/CSS/HTML.
      // NOT the splash images — see globIgnores below (iOS fetches those itself).
      includeAssets: ['icons/apple-touch-icon-180.png'],
      manifest: {
        name: 'Wood Block Puzzle',
        short_name: 'WoodBlocks',
        description: 'A cozy wood-themed block-placement puzzle.',
        display: 'standalone',
        orientation: 'portrait',
        // Relative to BASE so it resolves under a project-site subpath.
        start_url: BASE,
        scope: BASE,
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // iOS fetches the ~2 MB of splash PNGs itself at add-to-home-screen time
        // and never reads them through the SW — keep them OUT of the precache so
        // the first-visit/install payload stays tiny. Manifest icons stay in.
        globIgnores: ['**/icons/splash*.png'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
