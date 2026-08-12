import { apiGet, apiGetList } from '@/lib/api-client';

/** A synced catalogue row as the console shows it (PLN-260808-Console-Product-List). */
export interface AdminProduct {
  handle: string;
  title: string;
  vendor: string | null;
  category: string | null;
  tags: string | null;
  sku: string | null;
  /** First ~100 characters of the description; the full text is in the detail view. */
  descriptionSnippet: string | null;
  price: number | null;
  currency: string;
  imageUrl: string | null;
  productUrl: string | null;
  status: string; // active | archived
  publishedAt: string | null;
  syncedAt: string | null;
  /** A product knowledge document exists for this handle. */
  inKnowledge: boolean;
}

/** One product in full — the detail dialog. */
export interface AdminProductDetail extends Omit<AdminProduct, 'descriptionSnippet'> {
  description: string | null;
}

export interface AdminProductSummary {
  total: number;
  active: number;
  archived: number;
  inKnowledge: number;
  lastSyncedAt: string | null;
}

export interface ProductListParams {
  page: number;
  pageSize: number;
  q?: string;
  category?: string;
  status?: string;
}

export const productsService = {
  list: (params: ProductListParams) =>
    apiGetList<AdminProduct>('/admin/products', {
      page: params.page,
      size: params.pageSize,
      ...(params.q ? { q: params.q } : {}),
      ...(params.category ? { category: params.category } : {}),
      ...(params.status ? { status: params.status } : {}),
    }),
  detail: (handle: string) =>
    apiGet<AdminProductDetail>(`/admin/products/${encodeURIComponent(handle)}`),
  summary: () => apiGet<AdminProductSummary>('/admin/products/summary'),
  categories: () => apiGet<string[]>('/admin/products/categories'),
};
