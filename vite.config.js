import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The marketplace code is a separate chunk (the seller landing page loads without it). So that every other page still starts fetching it right away
// instead of waiting for the entry script to run first, the built index.html gets a modulepreload for it, skipped on the seller landing page.
function preloadAppChunk() {
  return {
    name: 'preload-app-chunk',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const chunk = Object.values(ctx.bundle || {}).find(c => c.type === 'chunk' && c.isDynamicEntry && c.name === 'App');
        if (!chunk) return html;
        const script = '<script>(function(){var p=location.pathname;if((/(^|\\.)credabilia\\.app$/i.test(location.hostname)&&p==="/")||p==="/sell")return;var l=document.createElement("link");l.rel="modulepreload";l.href="/' + chunk.fileName + '";document.head.appendChild(l)})()</script>';
        return html.replace('</head>', script + '</head>');
      },
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    preloadAppChunk(),
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
