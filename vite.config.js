import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // manifest.json is hand-authored in public/ and already linked from index.html --
      // this plugin only owns the service worker (installability + offline app shell).
      manifest: false,
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: { enabled: false },
      // injectManifest (a custom src/sw.js), not generateSW: push notifications need a real
      // `push`/`notificationclick` handler, which a fully auto-generated service worker has no
      // room for. src/sw.js still precaches the same app-shell-only, no-runtime-caching build.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html}'],
      },
    }),
  ],
  server: { strictPort: true },
});
