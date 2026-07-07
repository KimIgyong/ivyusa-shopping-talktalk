import axios, { AxiosError } from 'axios';
import type { ApiEnvelope, Paginated } from './types';
import { useAuthStore } from '@/store/auth-store';

/** Pagination meta the backend sends alongside list payloads (@ivy/types PaginationMeta). */
interface PaginationMeta {
  page: number;
  size: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';

export const http = axios.create({ baseURL });

http.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (response) => {
    const body = response.data as (ApiEnvelope<unknown> & { pagination?: PaginationMeta }) | undefined;
    if (body && typeof body === 'object' && 'success' in body) {
      if (!body.success) {
        throw new Error(body.error?.message || 'Request failed');
      }
      response.data = body.data;
      // Preserve list pagination for apiGetList without changing the shape
      // bare-array consumers (apiGet) already rely on.
      if (body.pagination) {
        (response as { __pagination?: PaginationMeta }).__pagination = body.pagination;
      }
    }
    return response;
  },
  (error: AxiosError<ApiEnvelope<unknown>>) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().clear();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    const envelope = error.response?.data;
    const message =
      (envelope && typeof envelope === 'object' && envelope.error?.message) ||
      error.message ||
      'Request failed';
    const wrapped = new Error(message) as Error & { status?: number; code?: string };
    wrapped.status = error.response?.status;
    wrapped.code = envelope?.error?.code;
    return Promise.reject(wrapped);
  },
);

// Helpers that return the unwrapped data directly.
export const apiGet = async <T>(url: string, params?: unknown): Promise<T> => {
  const res = await http.get<T>(url, { params: params as object });
  return res.data;
};

/**
 * List fetch that reconstructs the `{ items, total, page, pageSize }` shape from
 * the standard list envelope. Use for endpoints that return `new Paginated(...)`
 * on the backend; plain `apiGet` still returns the bare `data` array.
 */
export const apiGetList = async <T>(url: string, params?: unknown): Promise<Paginated<T>> => {
  const res = await http.get<T[]>(url, { params: params as object });
  const p = (res as { __pagination?: PaginationMeta }).__pagination;
  return {
    items: (res.data ?? []) as T[],
    total: p?.totalCount ?? (Array.isArray(res.data) ? res.data.length : 0),
    page: p?.page ?? 1,
    pageSize: p?.size ?? 0,
  };
};

export const apiPost = async <T>(url: string, data?: unknown): Promise<T> => {
  const res = await http.post<T>(url, data);
  return res.data;
};

export const apiPut = async <T>(url: string, data?: unknown): Promise<T> => {
  const res = await http.put<T>(url, data);
  return res.data;
};

export const apiPatch = async <T>(url: string, data?: unknown): Promise<T> => {
  const res = await http.patch<T>(url, data);
  return res.data;
};

export const apiDelete = async <T>(url: string): Promise<T> => {
  const res = await http.delete<T>(url);
  return res.data;
};

export const getErrorStatus = (err: unknown): number | undefined => {
  if (err && typeof err === 'object' && 'status' in err) {
    return (err as { status?: number }).status;
  }
  return undefined;
};
