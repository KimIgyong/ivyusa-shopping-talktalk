import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { BaseListResponse, BaseSingleResponse, PaginationMeta } from '@ivy/types';

/** Marker an interceptor recognizes to emit a list envelope with pagination. */
export class Paginated<T> {
  constructor(
    public readonly items: T[],
    public readonly pagination: PaginationMeta,
  ) {}
}

/**
 * Wraps controller return values into the standard response envelope.
 * Already-wrapped payloads (have `success`) and SSE streams pass through.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, unknown> {
  intercept(_ctx: ExecutionContext, next: CallHandler<T>): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        const timestamp = new Date().toISOString();
        if (data && typeof data === 'object' && 'success' in (data as object)) {
          return data;
        }
        if (data instanceof Paginated) {
          const body: BaseListResponse<unknown> = {
            success: true,
            data: data.items,
            pagination: data.pagination,
            timestamp,
          };
          return body;
        }
        const body: BaseSingleResponse<unknown> = {
          success: true,
          data: (data ?? null) as unknown,
          timestamp,
        };
        return body;
      }),
    );
  }
}
