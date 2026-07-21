import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Read env via loadEnv so VITE_BASE from .env / .env.* is honored at build time
// (vite does NOT populate process.env from .env for the config itself).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // Base path for assets. Default '/'; set VITE_BASE=/widget/ to serve under /widget.
    base: env.VITE_BASE || '/',
    plugins: [react()],
    server: {
      port: 5174,
    },
  };
});
