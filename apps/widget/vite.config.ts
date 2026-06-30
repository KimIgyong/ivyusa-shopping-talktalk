import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Base path for assets. Dev/default '/'; staging serves under '/widget/' (VITE_BASE).
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  server: {
    port: 5174,
  },
});
