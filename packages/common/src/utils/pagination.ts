import { PaginationMeta } from '@ivy/types';

export interface PageParams {
  page: number;
  size: number;
}

export function normalizePage(page?: number | string, size?: number | string): PageParams {
  const p = Math.max(1, Number(page) || 1);
  const s = Math.min(100, Math.max(1, Number(size) || 20));
  return { page: p, size: s };
}

export function buildPagination(page: number, size: number, totalCount: number): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(totalCount / size));
  return {
    page,
    size,
    totalCount,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}
