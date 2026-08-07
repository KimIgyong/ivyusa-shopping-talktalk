import type { ProductCardResponse } from '../../../product/dto/response/product.response';

/** Returned to the sender right after creating a nudge (feeds the OS share sheet). */
export interface CreateNudgeResponse {
  code: string;
  url: string;
}

/** The public card a recipient sees at /app/nudge/:code — no session required. */
export interface NudgeCardResponse {
  message: string | null;
  senderName: string | null;
  createdAt: Date;
  product: ProductCardResponse | null;
}
