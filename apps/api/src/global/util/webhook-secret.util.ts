import { HttpStatus, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { BusinessException } from '../exception/business.exception';
import { ERROR_CODE } from '../constant/error-code.constant';

const logger = new Logger('WebhookSecret');

/**
 * Verify a shared-secret header on a public webhook that has no provider HMAC
 * (e.g. the generic fulfillment webhook, FR-021). The caller must present the
 * `X-Webhook-Secret` header matching `FULFILLMENT_WEBHOOK_SECRET`.
 *
 * Fails CLOSED: when the secret is unset we allow only in local development and
 * reject everywhere else (SEC-C2) — an unsigned public endpoint must never mutate
 * order state / dispatch notifications for anonymous callers in staging/production.
 */
export function verifyFulfillmentWebhookSecret(provided: string | undefined): void {
  const expected = process.env.FULFILLMENT_WEBHOOK_SECRET;
  if (!expected) {
    if (process.env.NODE_ENV === 'development') {
      logger.warn('FULFILLMENT_WEBHOOK_SECRET not set — allowing webhook unverified (development only)');
      return;
    }
    logger.error('FULFILLMENT_WEBHOOK_SECRET not set — rejecting webhook (fail closed)');
    throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.UNAUTHORIZED);
  }
  const a = Buffer.from(provided ?? '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.UNAUTHORIZED);
  }
}
