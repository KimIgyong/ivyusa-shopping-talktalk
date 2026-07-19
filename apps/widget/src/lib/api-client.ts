import axios, { AxiosError } from 'axios';

const BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';

export const SESSION_STORAGE_KEY = 'ivy_session';

export function getStoredSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredSessionToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(SESSION_STORAGE_KEY, token);
    else localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* ignore storage failures */
  }
}

/** Standard API envelope. */
export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: { code?: string; message?: string } | string | null;
}

const raw = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

function unwrapError(err: unknown): Error {
  if (err instanceof AxiosError) {
    const env = err.response?.data as ApiEnvelope<unknown> | undefined;
    const e = env?.error;
    const msg =
      typeof e === 'string'
        ? e
        : e?.message || err.message || 'Request failed';
    const wrapped = new Error(msg) as Error & { status?: number; code?: string };
    wrapped.status = err.response?.status;
    if (e && typeof e !== 'string') wrapped.code = e.code;
    return wrapped;
  }
  return err instanceof Error ? err : new Error('Unknown error');
}

/** Unwrap the envelope: return `data` on success, throw `error` otherwise. */
async function unwrap<T>(p: Promise<{ data: ApiEnvelope<T> }>): Promise<T> {
  try {
    const res = await p;
    const env = res.data;
    if (env && env.success) return env.data;
    const e = env?.error;
    const msg =
      typeof e === 'string' ? e : e?.message || 'Request failed';
    throw new Error(msg);
  } catch (err) {
    throw unwrapError(err);
  }
}

export const apiClient = {
  get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    return unwrap<T>(raw.get(url, { params }));
  },
  post<T>(url: string, body?: unknown): Promise<T> {
    return unwrap<T>(raw.post(url, body));
  },
  put<T>(url: string, body?: unknown): Promise<T> {
    return unwrap<T>(raw.put(url, body));
  },
};
