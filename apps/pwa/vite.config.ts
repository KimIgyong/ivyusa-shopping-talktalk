import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served at https://<host>/app/ behind nginx (PLN-PWA W-5); SW scope matches.
export default defineConfig({
  base: '/app/',
  plugins: [react()],
});
