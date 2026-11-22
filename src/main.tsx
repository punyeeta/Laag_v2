import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

// Development only: lets a debugging script reach the live store and repo.
if (import.meta.env.DEV) {
  Promise.all([
    import('./data/store'),
    import('./data/repo'),
    import('./data/seed'),
    import('./data/firebase'),
    import('firebase/firestore'),
  ]).then(([store, repo, seed, fb, fs]) => {
    (window as unknown as { __laag: unknown }).__laag = { store, repo, seed, fb, fs };
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
