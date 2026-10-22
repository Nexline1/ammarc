import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { board } from './canvas/Board.tsx';
import './styles.css';

Object.assign(window, { __armBoard: board }); // read-only hook for the e2e tests (zoom level, image size)
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
