import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * App-wide flood limiter (SEC-H3, secondary to the per-account login limiter).
 * Keys the rate window by the real client IP — the first X-Forwarded-For hop set
 * by the edge nginx — instead of the socket address (which, behind the reverse
 * proxy, is the same for every client). Falls back to the socket IP in dev.
 *
 * The default limit is deliberately generous so it does not affect legitimate
 * shopper traffic (multiple shoppers can share one CGNAT/office IP); the highest-
 * frequency widget poll routes are additionally @SkipThrottle'd. General DoS
 * protection still belongs at the edge/WAF where per-client tuning is possible.
 */
@Injectable()
export class XffThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const xff = req.headers?.['x-forwarded-for'];
    const first =
      typeof xff === 'string'
        ? xff.split(',')[0]?.trim()
        : Array.isArray(xff)
          ? String(xff[0]).trim()
          : undefined;
    return first || req.ip || 'unknown';
  }
}
