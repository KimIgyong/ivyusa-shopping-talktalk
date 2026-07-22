#!/usr/bin/env node
/**
 * set-public-domain — switch the PUBLIC base URL the dev stack advertises to
 * Shopify (OAuth redirect, App-Proxy, webhooks) and serves the widget from.
 *
 * The domain lives in three per-app env files (Vite needs its own VITE_* vars,
 * so they can't share one). This rewrites all three at once, idempotently, then
 * prints the URLs you must set by hand in the Shopify app's Partner Dashboard.
 *
 * Usage:
 *   node scripts/set-public-domain.mjs <preset|https://your.domain>
 *   npm run set-domain -- tailscale
 *   npm run set-domain -- https://foo.trycloudflare.com
 *
 * Add a new reusable domain by editing PRESETS below.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── Reusable domains — add more here ────────────────────────────────────────
const PRESETS = {
  tailscale: 'https://huy-amoeba.tailc23542.ts.net',
  shoptalk: 'https://shoptalk.amoeba.site',
  local: 'http://localhost:3000',
};

// Each target file owns exactly one env KEY; its value is derived from the base.
const TARGETS = [
  { file: 'env/backend/.env.development', key: 'SHOPIFY_APP_URL', val: (d) => d },
  { file: 'apps/widget/.env', key: 'VITE_API_BASE_URL', val: (d) => `${d}/api/v1` },
  { file: 'apps/web/.env.local', key: 'VITE_WIDGET_URL', val: (d) => `${d}/widget` },
];

function upsertEnv(absPath, key, value) {
  let text = existsSync(absPath) ? readFileSync(absPath, 'utf8') : '';
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) text = text.replace(re, line);
  else text += (text && !text.endsWith('\n') ? '\n' : '') + line + '\n';
  writeFileSync(absPath, text);
}

const arg = process.argv[2];
if (!arg || arg === '-h' || arg === '--help') {
  console.log('Usage: node scripts/set-public-domain.mjs <preset|https://domain>');
  console.log('Presets:');
  for (const [k, v] of Object.entries(PRESETS)) console.log(`  ${k.padEnd(10)} ${v}`);
  process.exit(arg ? 0 : 1);
}

const base = (PRESETS[arg] ?? arg).replace(/\/+$/, '');
if (!/^https?:\/\/[^/]+$/.test(base)) {
  console.error(`Invalid domain "${base}" — expected e.g. https://host (no path).`);
  process.exit(1);
}

console.log(`Setting public base URL → ${base}\n`);
for (const t of TARGETS) {
  const v = t.val(base);
  upsertEnv(join(ROOT, t.file), t.key, v);
  console.log(`  ✓ ${t.file}  →  ${t.key}=${v}`);
}

console.log(`\n⚙  Set these by hand in the Shopify app's Partner Dashboard:`);
console.log(`     App URL          ${base}`);
console.log(`     Redirect URL     ${base}/api/v1/auth/shopify/callback`);
console.log(`     App proxy URL    ${base}/api/v1/shopify/proxy   (prefix apps, subpath ivy)`);
for (const w of ['customers/data_request', 'customers/redact', 'shop/redact']) {
  console.log(`     Compliance wh    ${base}/api/v1/webhooks/shopify/${w}`);
}
console.log(`\n↻  Restart dev servers (API :3000, web :5173, widget :5174) to pick up the new env.`);
console.log(`   Note: shopify.app.toml belongs to a separate app (shoptalk) and is NOT touched.`);
