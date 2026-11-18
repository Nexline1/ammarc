import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { board } from './canvas/Board.tsx';
import { get } from './store.ts';
import './styles.css';

Object.assign(window, { __armBoard: board, __armState: get }); // read-only hooks for the e2e tests
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
