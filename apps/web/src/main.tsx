import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { registerSW } from 'virtual:pwa-register';
import { router } from './app/router.js';
import { installUnlock } from './shared/audio.js';
import './styles/app.css';

// Service worker de la PWA : mise à jour silencieuse au prochain chargement.
registerSW({ immediate: true });
// Le son se déverrouille au premier geste, sur l'écran central comme sur le téléphone.
installUnlock();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
