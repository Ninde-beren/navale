import { createBrowserRouter } from 'react-router';
import { Shell } from './Shell.js';
import { Board } from '../surfaces/board/Board.js';
import { HostLanding } from '../surfaces/board/HostLanding.js';
import { CreateGame } from '../surfaces/home/CreateGame.js';
import { Home } from '../surfaces/home/Home.js';
import { OgCard } from '../surfaces/home/OgCard.js';
import { Play } from '../surfaces/play/Play.js';
import { Replay, ReplayOpen } from '../surfaces/replay/Replay.js';

export const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/create', element: <CreateGame /> },
      { path: '/board/:code', element: <Board /> },
      // Lien d'hôte : le jeton suit le #, jamais envoyé au serveur dans l'adresse.
      { path: '/host/:code', element: <HostLanding /> },
      { path: '/play/:code', element: <Play /> },
      { path: '/replay', element: <ReplayOpen /> },
      { path: '/replay/:gameId', element: <Replay /> },
      // Source de l'image d'aperçu de lien, à photographier en développement (voir OgCard).
      ...(import.meta.env.DEV ? [{ path: '/og-card', element: <OgCard /> }] : []),
    ],
  },
]);
