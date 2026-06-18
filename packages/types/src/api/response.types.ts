// Standard API response envelope (amoeba_code_convention_v2 — standard response wrapping).

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

export interface PaginationMeta {
  page: number;
  size: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface BaseSingleResponse<T> {
  success: boolean;
  data: T | null;
  error?: ApiError;
  timestamp: string;
}

export interface BaseListResponse<T> {
  success: boolean;
  data: T[];
  pagination: PaginationMeta;
  error?: ApiError;
  timestamp: string;
}
