/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { NIGHT_900 } from './design-tokens.mjs';
import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME } from './brand.mjs';

/**
 * Substitutes the product name into index.html, which is otherwise static and
 * would need editing by hand on every rename. Keeps `brand.mjs` the only place
 * the name is written down.
 */
const injectBrand = (): PluginOption => ({
  name: 'inject-brand',
  transformIndexHtml: (html: string) =>
    html.replaceAll('%APP_NAME%', APP_NAME).replaceAll('%APP_DESCRIPTION%', APP_DESCRIPTION),
});

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Tauri points at a fixed dev URL, so a port collision must fail loudly
  // rather than silently moving to 5174 and leaving the app window blank.
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // Rust build artefacts are noisy and would trigger endless reloads.
      ignored: ['**/src-tauri/**'],
    },
  },
  // Tauri's own output is more useful than Vite's banner during `tauri dev`.
  clearScreen: false,
  plugins: [
    react(),
    tailwindcss(),
    injectBrand(),
    VitePWA({
      // 'prompt', not 'autoUpdate': a service worker that reloads the page
      // mid-session would destroy an in-flight focus block. The user decides when.
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: APP_NAME,
        short_name: APP_SHORT_NAME,
        description: APP_DESCRIPTION,
        theme_color: NIGHT_900,
        background_color: NIGHT_900,
        display: 'standalone',
        start_url: '/',
        scope: '/',
        categories: ['productivity', 'lifestyle'],
        // No maskable icon: that purpose exists for Android launchers, and
        // this build targets desktop browsers only.
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The app shell must be available offline — a timer that needs the
        // network to start is not a timer.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  test: {
    globals: true,
    // Node by default: most of this codebase is pure domain logic (timer
    // machine, sky generator, streak and currency math) that has no business
    // needing a DOM, and spinning jsdom up for it costs far more than the
    // tests themselves. Component tests opt in with a
    // `// @vitest-environment jsdom` docblock at the top of the file.
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**', 'src/**/index.ts'],
    },
  },
});
