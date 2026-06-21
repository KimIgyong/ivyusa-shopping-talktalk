import { EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm';
import { currentTenantId } from './tenant-context';

/**
 * Auto-stamps `tenant_id` on insert from the request's tenant context, for any
 * entity that has a `tenantId` column and hasn't set it explicitly. Centralizes
 * write-side tenant isolation so individual services don't have to remember it.
 */
@EventSubscriber()
export class TenantSubscriber implements EntitySubscriberInterface {
  beforeInsert(event: InsertEvent<Record<string, unknown>>): void {
    const hasTenantColumn = event.metadata.columns.some((c) => c.propertyName === 'tenantId');
    if (!hasTenantColumn) return;
    const entity = event.entity as { tenantId?: number | null } | undefined;
    if (!entity) return;
    if (entity.tenantId === undefined || entity.tenantId === null) {
      const tenantId = currentTenantId();
      if (tenantId != null) entity.tenantId = tenantId;
    }
  }
}
