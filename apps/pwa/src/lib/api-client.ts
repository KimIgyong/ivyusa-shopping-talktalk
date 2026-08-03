import { API_BASE_URL } from './config';

/** Standard API envelope (mirrors apps/mobile/src/lib/api-client.ts). */
interface Envelope<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string } | null;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type Query = Record<string, string | number | undefined>;

function buildQuery(query?: Query): string {
  if (!query) return '';
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  opts: { query?: Query; body?: unknown; sessionToken?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  // Token travels in X-Session-Token, never the URL (PRV-M7 parity with widget).
  if (opts.sessionToken) headers['x-session-token'] = opts.sessionToken;

  const res = await fetch(`${API_BASE_URL}${path}${buildQuery(opts.query)}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  let envelope: Envelope<T>;
  try {
    envelope = (await res.json()) as Envelope<T>;
  } catch {
    throw new ApiError('E9001', `Invalid response (HTTP ${res.status})`, res.status);
  }
  if (!res.ok || !envelope.success) {
    const err = envelope.error ?? { code: 'E9001', message: `HTTP ${res.status}` };
    throw new ApiError(err.code, err.message, res.status);
  }
  return envelope.data;
}

export const apiClient = {
  get: <T>(path: string, sessionToken?: string, query?: Query) =>
    request<T>('GET', path, { sessionToken, query }),
  post: <T>(path: string, body?: unknown, sessionToken?: string) =>
    request<T>('POST', path, { sessionToken, body }),
  put: <T>(path: string, body?: unknown, sessionToken?: string) =>
    request<T>('PUT', path, { sessionToken, body }),
};
