import { createBrowserRouter } from 'react-router';
import { Board } from '../surfaces/board/Board.js';
import { CreateGame } from '../surfaces/home/CreateGame.js';
import { Home } from '../surfaces/home/Home.js';
import { Play } from '../surfaces/play/Play.js';

export const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/create', element: <CreateGame /> },
  { path: '/board/:code', element: <Board /> },
  { path: '/play/:code', element: <Play /> },
]);
