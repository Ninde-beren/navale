import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import tailwindcss from '@tailwindcss/vite';

const server = process.env.SERVER_URL ?? 'http://localhost:5251';
// WEB_HTTPS=0 sert le web en HTTP clair (outils qui refusent un certificat auto-signé).
const https = process.env.WEB_HTTPS !== '0';

// Une seule origine en développement : Vite sert le web en HTTPS et proxifie
// l'API et le WebSocket vers le serveur Node. Un seul certificat à accepter sur le téléphone.
export default defineConfig({
  plugins: [react(), tailwindcss(), ...(https ? [basicSsl()] : [])],
  server: {
    host: true,
    port: Number(process.env.WEB_PORT ?? 5250),
    strictPort: true,
    proxy: {
      '/api': { target: server, changeOrigin: true },
      '/socket.io': { target: server.replace(/^http/, 'ws'), ws: true, changeOrigin: true },
    },
  },
});
