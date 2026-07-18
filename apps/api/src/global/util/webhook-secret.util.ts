import { HttpStatus, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { BusinessException } from '../exception/business.exception';
import { ERROR_CODE } from '../constant/error-code.constant';

const logger = new Logger('WebhookSecret');

/**
 * Assert a caller-presented shared secret matches the expected one, for public
 * webhooks that have no provider HMAC (e.g. the generic fulfillment webhook, and
 * future non-Shopify commerce webhooks). The `expected` value is resolved by the
 * caller — typically a per-tenant secret from `integration_credentials` with a
 * global env fallback (see WebhookSecretService).
 *
 * Fails CLOSED: when `expected` is empty (no secret configured anywhere) we accept
 * only under `NODE_ENV=development` and reject everywhere else (SEC-C2). An unsigned
 * public endpoint must never mutate state for anonymous callers in staging/prod.
 */
export function assertWebhookSecret(
  provided: string | undefined,
  expected: string | undefined,
): void {
  if (!expected) {
    if (process.env.NODE_ENV === 'development') {
      logger.warn('webhook secret not configured — allowing unverified (development only)');
      return;
    }
    logger.error('webhook secret not configured — rejecting webhook (fail closed)');
    throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.UNAUTHORIZED);
  }
  const a = Buffer.from(provided ?? '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.UNAUTHORIZED);
  }
}

/**
 * Env-only convenience for callers without a tenant context: verify the generic
 * fulfillment webhook against the global `FULFILLMENT_WEBHOOK_SECRET`. Prefer the
 * tenant-aware path (WebhookSecretService.resolve → assertWebhookSecret) when a
 * tenant can be resolved from the request.
 */
export function verifyFulfillmentWebhookSecret(provided: string | undefined): void {
  assertWebhookSecret(provided, process.env.FULFILLMENT_WEBHOOK_SECRET);
}
