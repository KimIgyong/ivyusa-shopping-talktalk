import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';

/**
 * `Cache-Control: no-store` on every API response (PRV-M7/SEC-L2).
 *
 * Nothing this API returns is cacheable-by-design: most routes are personal (a
 * shopper's orders, notifications, chat history, DSAR export) and the rest is
 * per-tenant config that costs one query. Sending no cache directives at all
 * left storage to each intermediary's heuristics, so forbid it outright — and
 * by default, so a new endpoint is private without its author remembering.
 *
 * Widget reads are the sharp edge. The session token now travels in the
 * `X-Session-Token` header (PRV-M7), so `GET /orders` is one URL for every
 * shopper: a shared cache keyed on the URL would be free to hand shopper B the
 * body it stored for shopper A. Query/path tokens stay accepted for back-compat,
 * which is the mirror hazard — there the token itself lands in the cache key.
 * Handler-thrown 404s matter too ("not your order" is heuristically cacheable,
 * and must not be replayed to the owner).
 *
 * Set BEFORE the handler runs rather than on the way out, so `@Res()` handlers
 * that write the response themselves are covered as well. Static assets are
 * served by middleware that never reaches an interceptor, so hashed bundles stay
 * cacheable; if a route ever wants caching, opt that route out here rather than
 * weakening the default.
 */
@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() === 'http') {
      const res = ctx.switchToHttp().getResponse<Response>();
      if (typeof res?.setHeader === 'function' && !res.headersSent) {
        res.setHeader('Cache-Control', 'no-store');
      }
    }
    return next.handle();
  }
}
