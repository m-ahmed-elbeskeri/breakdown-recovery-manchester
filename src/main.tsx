import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const root = document.getElementById('root')!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

// Production pages are prerendered (scripts/prerender.mjs), and each one
// carries the path it was rendered for. React attaches to that HTML only
// when it is the page being shown: a host's SPA fallback can hand the
// prerendered homepage to a URL it was never rendered for, and hydrating the
// wrong page produces a flash of the wrong content followed by a hydration
// error. Anything else, including the empty root in development, is
// rendered from scratch.
const here = location.pathname.replace(/\/+$/, '') || '/';
if (root.dataset.prerendered === here && root.firstElementChild) {
  hydrateRoot(root, app);
} else {
  root.replaceChildren();
  createRoot(root).render(app);
}
