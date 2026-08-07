import type { ProductCardResponse } from '../../../product/dto/response/product.response';

/** A saved product with its catalog card joined in (null when the handle left the catalog). */
export interface SaveResponse {
  id: number;
  list: string;
  note: string | null;
  productHandle: string;
  createdAt: Date;
  product: ProductCardResponse | null;
}
