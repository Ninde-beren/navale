import { createBrowserRouter } from 'react-router';
import { Shell } from './Shell.js';
import { Board } from '../surfaces/board/Board.js';
import { CreateGame } from '../surfaces/home/CreateGame.js';
import { Home } from '../surfaces/home/Home.js';
import { OgCard } from '../surfaces/home/OgCard.js';
import { Play } from '../surfaces/play/Play.js';

export const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/create', element: <CreateGame /> },
      { path: '/board/:code', element: <Board /> },
      { path: '/play/:code', element: <Play /> },
      // Source de l'image d'aperçu de lien, à photographier en développement (voir OgCard).
      ...(import.meta.env.DEV ? [{ path: '/og-card', element: <OgCard /> }] : []),
    ],
  },
]);
