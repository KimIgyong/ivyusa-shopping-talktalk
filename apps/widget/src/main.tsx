import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './i18n/i18n';
import App from './App';
import './index.css';
import { applyCachedTheme } from './lib/theme';
import { getShopDomain } from './hooks/useSession';

// Before the first render, not after: session/ensure is a round trip, and a
// themed widget that paints in the default blue and then recolours is a visible
// flash on every visit. The cache makes that a first-visit-only cost
// (PLN-260818 §2.5).
applyCachedTheme(getShopDomain());

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
