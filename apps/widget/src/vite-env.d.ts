/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** GA4 measurement ID (G-XXXXXXXXXX). Unset → analytics disabled (no-op). */
  readonly VITE_GA4_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
