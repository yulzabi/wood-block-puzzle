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
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  plugins: isTest ? [] : [
    VitePWA({
      registerType: 'autoUpdate',
      // Exercise the service worker in dev so offline behavior can be validated early.
      devOptions: { enabled: true, type: 'module' },
      // Precache these public assets in addition to the built JS/CSS/HTML.
      includeAssets: ['icons/apple-touch-icon-180.png', 'icons/splash.png'],
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
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
