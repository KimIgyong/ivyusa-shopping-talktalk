import { Injectable, NestMiddleware } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

/**
 * Per-request context propagated via AsyncLocalStorage so deep call sites
 * (audit writes, schedulers triggered by a request) can attach the originating
 * request id + client IP without threading them through every signature.
 * Outside an HTTP request (boot schedulers, event-bus consumers) the store is
 * simply absent and accessors return undefined — callers must tolerate that.
 */
export interface RequestContext {
  requestId: string;
  ip: string | null;
}

const als = new AsyncLocalStorage<RequestContext>();

/** Current request's context, or undefined outside an HTTP request scope. */
export function getRequestContext(): RequestContext | undefined {
  return als.getStore();
}

/** Run fn inside an explicit context (middleware internals + tests). */
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return als.run(ctx, fn);
}

/**
 * Seeds the AsyncLocalStorage context for every route (Stage 4, audit
 * traceability). requestId honors an incoming `x-request-id` (edge nginx /
 * upstream tracing) and falls back to a fresh UUID; the client IP is the first
 * X-Forwarded-For hop set by the edge proxy (same trust model as
 * XffThrottlerGuard), falling back to the socket address in dev.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const rawId = req.headers['x-request-id'];
    const headerId = Array.isArray(rawId) ? rawId[0] : rawId;
    // Column is VARCHAR(36) (UUID-sized) — clamp arbitrary client input.
    const requestId = (headerId?.trim() || randomUUID()).slice(0, 36);

    const xff = req.headers['x-forwarded-for'];
    const firstHop =
      typeof xff === 'string'
        ? xff.split(',')[0]?.trim()
        : Array.isArray(xff)
          ? String(xff[0]).split(',')[0]?.trim()
          : undefined;
    // ip column is VARCHAR(45) (IPv6 max) — clamp defensively as well.
    const ip = (firstHop || req.ip || null)?.slice(0, 45) ?? null;

    runWithRequestContext({ requestId, ip }, () => next());
  }
}
