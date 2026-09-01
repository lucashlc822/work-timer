import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';
import './styles/index.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Missing #root element — index.html and main.tsx have diverged.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
