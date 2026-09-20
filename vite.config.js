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
      workbox: {
        // Deliberately no runtimeCaching rules: every Supabase call (listings, purchases,
        // refunds, balances) must always hit the network, never a cached response -- this is a
        // live marketplace, not content that's safe to serve stale. Precaching only covers the
        // built JS/CSS/HTML app shell, so the UI itself still loads instantly offline; the
        // app's own existing error states handle the "no network" case for data.
        navigateFallback: '/index.html',
      },
    }),
  ],
  server: { strictPort: true },
});
