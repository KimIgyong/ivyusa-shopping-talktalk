import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Request } from 'express';
import { Observable, from } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { Principal } from '@ivy/types';
import { tenantStorage } from '../../infrastructure/tenant/tenant-context';

/**
 * Resolves the tenant for each request and runs the handler inside the tenant
 * AsyncLocalStorage context. Resolution order:
 *   1) authenticated tenant user → principal.tenantId
 *   2) widget request → tenant of the `session_token`
 *   3) fallback → the default tenant, ONLY when a single tenant exists
 * System admins (cross-tenant) get tenantId = null (no auto-scoping).
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request>();
    return from(this.resolveTenantId(req)).pipe(
      mergeMap(
        (tenantId) =>
          new Observable((subscriber) => {
            tenantStorage.run({ tenantId }, () => {
              next.handle().subscribe({
                next: (v) => subscriber.next(v),
                error: (e) => subscriber.error(e),
                complete: () => subscriber.complete(),
              });
            });
          }),
      ),
    );
  }

  private async resolveTenantId(req: Request): Promise<number | null> {
    const user = req.user as Principal | undefined;
    if (user?.actorType === 'user') return user.tenantId;
    if (user?.actorType === 'admin') return null; // cross-tenant platform actor

    const token =
      (req.body && (req.body as Record<string, string>).session_token) ||
      (req.query?.session_token as string | undefined) ||
      (req.headers['x-session-token'] as string | undefined);
    if (token) {
      try {
        const rows: Array<{ tenant_id: number | null }> = await this.dataSource.query(
          'SELECT tenant_id FROM sessions WHERE session_token = ? LIMIT 1',
          [token],
        );
        if (rows?.[0]?.tenant_id != null) return Number(rows[0].tenant_id);
      } catch {
        /* fall through to default */
      }
    }
    return this.getDefaultTenantId();
  }

  private async getDefaultTenantId(): Promise<number | null> {
    // Only default when EXACTLY ONE tenant exists (single store / dev). With
    // multiple tenants we refuse to guess — silently binding a tokenless request
    // to the lowest-id tenant mis-attributes widget data across tenants (SEC-L6).
    // Not cached: the tokenless path is rare, and a cached positive id would go
    // stale (and become unsafe) the moment a second tenant is onboarded.
    try {
      const rows: Array<{ id: number }> = await this.dataSource.query(
        'SELECT id FROM tenants ORDER BY id ASC LIMIT 2',
      );
      return rows?.length === 1 ? Number(rows[0].id) : null;
    } catch {
      return null;
    }
  }
}
