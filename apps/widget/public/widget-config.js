/**
 * Per-deployment widget configuration (PLN-260819 S3).
 *
 * Loaded synchronously BEFORE the module bundle, so `api-client` can read it at
 * import time — a fetch here would race the first request. Replaced (bind-mount
 * or COPY) per deployment; the shipped copy is empty on purpose, which makes the
 * widget talk to `/api/v1` on its own origin — exactly what a co-deployed stack
 * serves, and what every current deployment already does.
 *
 * Example for a split deployment:
 *   window.__SHOPTALK_CONFIG__ = { apiBase: "https://talk.ivyusa.com/api/v1" };
 */
window.__SHOPTALK_CONFIG__ = window.__SHOPTALK_CONFIG__ || {};
