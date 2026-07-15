import { EcommerceProvider } from '@ivy/types';

export interface ProbeResult {
  ok: boolean;
  detail: string;
}

const TIMEOUT_MS = 6000;
/** Header-bound secrets must be printable ASCII, else fetch throws a ByteString error. */
const ASCII = /^[\x21-\x7e]+$/;

async function httpFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function missing(): ProbeResult {
  return { ok: false, detail: 'Required credentials are missing — fill in and save first' };
}

function normHost(v: string): string {
  return v.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

/**
 * Live connectivity probe per e-commerce provider. Never throws — any failure is
 * returned as { ok:false, detail }. Each provider hits a lightweight authenticated
 * endpoint with the stored credentials.
 */
export async function probeEcommerce(
  provider: EcommerceProvider,
  config: Record<string, string>,
): Promise<ProbeResult> {
  try {
    switch (provider) {
      case 'woocommerce':
        return await probeWoocommerce(config);
      case 'odoo':
        return await probeOdoo(config);
      case 'cafe24':
        return await probeCafe24(config);
      case 'haravan':
        return await probeHaravan(config);
      default:
        return { ok: false, detail: 'Unsupported provider' };
    }
  } catch (e) {
    return { ok: false, detail: `Connection failed: ${(e as Error).message}` };
  }
}

/** WooCommerce REST v3 — Basic auth (consumer key/secret) against system_status. */
async function probeWoocommerce(c: Record<string, string>): Promise<ProbeResult> {
  const base = (c.store_url ?? '').trim().replace(/\/+$/, '');
  const key = (c.consumer_key ?? '').trim();
  const secret = (c.consumer_secret ?? '').trim();
  if (!base || !key || !secret) return missing();
  if (!ASCII.test(key) || !ASCII.test(secret)) {
    return { ok: false, detail: 'Consumer key/secret contain invalid characters' };
  }
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const res = await httpFetch(`${base}/wp-json/wc/v3/system_status`, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });
  if (res.ok) return { ok: true, detail: 'Connected' };
  return { ok: false, detail: `WooCommerce returned ${res.status}` };
}

/** Odoo external API — JSON-RPC common.authenticate returns a numeric uid on success. */
async function probeOdoo(c: Record<string, string>): Promise<ProbeResult> {
  const url = (c.url ?? '').trim().replace(/\/+$/, '');
  const db = (c.db ?? '').trim();
  const username = (c.username ?? '').trim();
  const apiKey = (c.api_key ?? '').trim();
  if (!url || !db || !username || !apiKey) return missing();
  const res = await httpFetch(`${url}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: { service: 'common', method: 'authenticate', args: [db, username, apiKey, {}] },
      id: 1,
    }),
  });
  if (!res.ok) return { ok: false, detail: `Odoo returned ${res.status}` };
  const data = (await res.json()) as { result?: unknown; error?: { data?: { message?: string } } };
  if (typeof data.result === 'number' && data.result > 0) {
    return { ok: true, detail: `Connected (uid ${data.result})` };
  }
  if (data.error) return { ok: false, detail: data.error.data?.message ?? 'Odoo authentication failed' };
  return { ok: false, detail: 'Odoo authentication failed — check db / user / API key' };
}

/** Cafe24 Admin API v2 — Bearer OAuth token against the store resource. */
async function probeCafe24(c: Record<string, string>): Promise<ProbeResult> {
  const mall = (c.mall_id ?? '').trim().replace(/\.cafe24api\.com.*$/, '');
  const token = (c.access_token ?? '').trim();
  if (!mall || !token) return missing();
  if (!ASCII.test(token)) return { ok: false, detail: 'Access token contains invalid characters' };
  const res = await httpFetch(`https://${mall}.cafe24api.com/api/v2/admin/store`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Cafe24-Api-Version': '2024-06-01',
    },
  });
  if (res.ok) return { ok: true, detail: 'Connected' };
  if (res.status === 401) return { ok: false, detail: 'Cafe24 token invalid or expired' };
  return { ok: false, detail: `Cafe24 returned ${res.status}` };
}

/** Haravan Admin API (Shopify-compatible) — Bearer access token against shop.json. */
async function probeHaravan(c: Record<string, string>): Promise<ProbeResult> {
  const shop = normHost(c.shop_domain ?? '');
  const token = (c.access_token ?? '').trim();
  if (!shop || !token) return missing();
  if (!ASCII.test(token)) return { ok: false, detail: 'Access token contains invalid characters' };
  const res = await httpFetch(`https://${shop}/admin/shop.json`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (res.ok) return { ok: true, detail: 'Connected' };
  if (res.status === 401) return { ok: false, detail: 'Haravan token invalid or expired' };
  return { ok: false, detail: `Haravan returned ${res.status}` };
}
