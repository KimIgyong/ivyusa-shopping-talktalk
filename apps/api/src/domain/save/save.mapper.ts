import type { SaveResponse } from './dto/response/save.response';
import { ProductSave } from './entity/product-save.entity';
import { ProductCache } from '../product/entity/product-cache.entity';
import { toProductCardResponse } from '../product/product.mapper';

/** Map a save row + its (optional) catalog join to the response shape. */
export function toSaveResponse(save: ProductSave, product: ProductCache | null): SaveResponse {
  return {
    id: save.id,
    list: save.list,
    note: save.note,
    productHandle: save.productHandle,
    createdAt: save.createdAt,
    product: product ? toProductCardResponse(product) : null,
  };
}
