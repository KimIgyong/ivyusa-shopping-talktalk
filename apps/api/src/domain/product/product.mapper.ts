import type { ProductCardResponse, ProductDetailResponse } from './dto/response/product.response';
import { ProductCache } from './entity/product-cache.entity';

/** Map a catalog row to the compact card shape (grids, recommendation rails). */
export function toProductCardResponse(p: ProductCache): ProductCardResponse {
  return {
    handle: p.handle,
    title: p.title,
    vendor: p.vendor,
    price: p.price,
    currency: p.currency,
    imageUrl: p.imageUrl,
    productUrl: p.productUrl,
    category: p.category,
  };
}

/** Map a catalog row to the full detail shape (product screen). */
export function toProductDetailResponse(p: ProductCache): ProductDetailResponse {
  return {
    ...toProductCardResponse(p),
    description: p.description,
    tags: p.tags,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    status: p.status,
  };
}
