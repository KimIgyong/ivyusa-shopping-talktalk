import { HttpStatus, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { BusinessException } from '../exception/business.exception';
import { ERROR_CODE } from '../constant/error-code.constant';

const logger = new Logger('ShopifyHmac');

/**
 * Verify a Shopify webhook HMAC (base64 HMAC-SHA256 over the raw request body).
 * Prefers `rawBody` (main.ts rawBody:true); falls back to a re-stringified copy.
 * In dev with no secret we log a warning and allow; otherwise mismatches throw 401.
 */
export function verifyShopifyHmac(
  rawBody: Buffer | undefined,
  payload: unknown,
  hmacHeader: string | undefined,
): void {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn('SHOPIFY_WEBHOOK_SECRET not set — allowing webhook unverified (dev only)');
    return;
  }
  const body =
    rawBody ?? Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload), 'utf8');
  const digest = crypto.createHmac('sha256', secret).update(body).digest('base64');
  const provided = hmacHeader ?? '';
  const a = Buffer.from(digest);
  const b = Buffer.from(provided);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.UNAUTHORIZED);
  }
}
