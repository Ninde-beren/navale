import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const server = process.env.SERVER_URL ?? 'http://localhost:5251';
// WEB_HTTPS=0 sert le web en HTTP clair (outils qui refusent un certificat auto-signé).
const https = process.env.WEB_HTTPS !== '0';

// Une seule origine en développement : Vite sert le web en HTTPS et proxifie
// l'API et le WebSocket vers le serveur Node. Un seul certificat à accepter sur le téléphone.
export default defineConfig({
  plugins: [
    react(),
    // En production, le serveur pose l'adresse publique dans index.html (http/static.ts).
    // En développement, une URL relative suffit : aucun aperçu de lien ne vise Vite.
    {
      name: 'navale-public-url-dev',
      apply: 'serve',
      transformIndexHtml: (html) => html.replaceAll('__PUBLIC_URL__', ''),
    },
    tailwindcss(),
    ...(https ? [basicSsl()] : []),
    // PWA installable : manifeste, icônes, service worker minimal qui ne
    // met en cache que l'application elle-même. L'API et le temps réel passent
    // toujours par le réseau ; il n'y a pas de mode hors-ligne.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Navale',
        short_name: 'Navale',
        description: 'Bataille navale à plusieurs : un écran central, un téléphone par joueur.',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#080c18',
        theme_color: '#080c18',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // `/admin` est une page du serveur : le service worker ne doit pas la remplacer par l'application.
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//, /^\/admin(\/|$)/],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    host: true,
    port: Number(process.env.WEB_PORT ?? 5250),
    strictPort: true,
    proxy: {
      '/api': { target: server, changeOrigin: true },
      '/socket.io': { target: server, ws: true },
      '/admin': { target: server, changeOrigin: true },
    },
  },
});
