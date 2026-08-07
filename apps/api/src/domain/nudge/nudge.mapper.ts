import type { NudgeCardResponse } from './dto/response/nudge.response';
import { Nudge } from './entity/nudge.entity';
import { ProductCache } from '../product/entity/product-cache.entity';
import { toProductCardResponse } from '../product/product.mapper';

/** Map a nudge to the public recipient card (message + sender + product card). */
export function toNudgeCardResponse(
  nudge: Nudge,
  senderName: string | null,
  product: ProductCache | null,
): NudgeCardResponse {
  return {
    message: nudge.message,
    senderName,
    createdAt: nudge.createdAt,
    product: product ? toProductCardResponse(product) : null,
  };
}
