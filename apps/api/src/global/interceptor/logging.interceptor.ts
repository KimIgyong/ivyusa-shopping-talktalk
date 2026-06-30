import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';

/**
 * Request access log: `METHOD path -> status (durationms)`.
 * Deliberately logs NO request body, query, or headers to avoid leaking PII
 * (POL — PII masking in logs). Only the method, path, status, and duration.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = ctx.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const method = req.method;
    // path only — never req.url (may carry query-string PII like session_token).
    const path = req.path ?? req.baseUrl ?? '';
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(`${method} ${path} -> ${res.statusCode} (${Date.now() - start}ms)`);
        },
        error: (err: { status?: number }) => {
          const status = typeof err?.status === 'number' ? err.status : 500;
          this.logger.warn(`${method} ${path} -> ${status} (${Date.now() - start}ms)`);
        },
      }),
    );
  }
}
