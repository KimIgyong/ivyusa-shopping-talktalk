import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Vite does not populate process.env from .env files for the config itself, so
  // read them explicitly — otherwise VITE_BASE in apps/widget/.env is silently
  // ignored and a subpath build emits root-absolute /assets/ URLs that 404.
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    // Base path for assets. Dev/default '/'; serving under <host>/widget needs '/widget/'.
    base: process.env.VITE_BASE ?? env.VITE_BASE ?? '/',
    plugins: [react()],
    server: {
      port: 5174,
      // Vite rejects requests whose Host header it doesn't recognise (403). When
      // the dev server sits behind a public tunnel/proxy for storefront testing,
      // list those hostnames here — comma-separated, env-driven so no machine's
      // domain is baked into the repo.
      allowedHosts: (env.VITE_ALLOWED_HOSTS ?? '')
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean),
    },
  };
});
