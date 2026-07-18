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
    // Fail CLOSED outside local development. These routes include destructive
    // GDPR paths (shop/redact → full tenant purge); a missing secret must never
    // silently accept unauthenticated requests in staging/production (SEC-C1).
    if (process.env.NODE_ENV === 'development') {
      logger.warn('SHOPIFY_WEBHOOK_SECRET not set — allowing webhook unverified (development only)');
      return;
    }
    logger.error('SHOPIFY_WEBHOOK_SECRET not set — rejecting webhook (fail closed)');
    throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.UNAUTHORIZED);
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

/**
 * Verify a Shopify OAuth *query* HMAC (hex HMAC-SHA256 over the sorted query
 * string, excluding `hmac`/`signature`). Used on the OAuth install callback.
 */
export function verifyShopifyQueryHmac(
  query: Record<string, unknown>,
  secret: string,
): boolean {
  const provided = query.hmac;
  if (typeof provided !== 'string' || !provided) return false;
  const message = Object.keys(query)
    .filter((k) => k !== 'hmac' && k !== 'signature')
    .sort()
    .map((k) => `${k}=${String(query[k])}`)
    .join('&');
  const digest = crypto.createHmac('sha256', secret).update(message).digest('hex');
  const a = Buffer.from(digest);
  const b = Buffer.from(provided);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Verify a Shopify *App Proxy* signature (hex HMAC-SHA256 over the sorted params
 * excluding `signature`, formatted `key=value` with array values comma-joined and
 * **no separator between pairs**, keyed by the app's client secret). Distinct from
 * the OAuth query HMAC (which uses `&` separators and the `hmac` param). Requests
 * proxied through the app carry a Shopify-verified `logged_in_customer_id`.
 * See: shopify.dev/docs/apps/build/online-store/display-dynamic-store-data.
 */
export function verifyShopifyProxySignature(
  query: Record<string, unknown>,
  secret: string,
): boolean {
  const provided = query.signature;
  if (typeof provided !== 'string' || !provided) return false;
  const message = Object.keys(query)
    .filter((k) => k !== 'signature')
    .sort()
    .map((k) => {
      const v = query[k];
      const val = Array.isArray(v) ? v.join(',') : String(v);
      return `${k}=${val}`;
    })
    .join('');
  const digest = crypto.createHmac('sha256', secret).update(message).digest('hex');
  const a = Buffer.from(digest);
  const b = Buffer.from(provided);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
