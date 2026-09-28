import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { startEarlyOAuthCallback } from './lib/oauthCallback';
import './index.css';

// If we're landing on the OAuth redirect URL, exchange the code right away
// using the session persisted in localStorage, before React mounts and before
// Supabase auth finishes restoring the session.
startEarlyOAuthCallback();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
