import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
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
      const http = ctx.switchToHttp();
      const res = http.getResponse<Response>();
      const req = typeof http.getRequest === 'function' ? http.getRequest<Request>() : null;
      if (typeof res?.setHeader === 'function' && !res.headersSent) {
        res.setHeader('Cache-Control', isSignedFileRead(req) ? FILE_CACHE : 'no-store');
      }
    }
    return next.handle();
  }
}

/** Shorter than the 15-minute signature life, so a cached copy can never
 * outlive the link that authorised it. `private` keeps it in the one browser
 * that asked — shared caches are still forbidden. */
const FILE_CACHE = 'private, max-age=600';

/**
 * The one opted-out route (PLN-260814): signed attachment reads. `no-store`
 * there would re-download every thumbnail on every poll-driven re-render of a
 * conversation. It is safe to cache because the URL is unguessable, carries its
 * own expiry, and is unique per file+variant — a different shopper's request is
 * a different cache key.
 */
function isSignedFileRead(req: Request | null): boolean {
  if (!req || req.method !== 'GET') return false;
  const path = (req.path ?? '').split('?')[0];
  return /\/files\/[^/]+$/.test(path) && typeof req.query?.sig === 'string';
}
