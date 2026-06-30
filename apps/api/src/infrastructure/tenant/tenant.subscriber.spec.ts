import { InsertEvent } from 'typeorm';
import { TenantSubscriber } from './tenant.subscriber';
import { tenantStorage } from './tenant-context';

/** Builds a minimal InsertEvent stub for the subscriber. */
function event(entity: Record<string, unknown>, hasTenantColumn = true): InsertEvent<Record<string, unknown>> {
  return {
    entity,
    metadata: { columns: hasTenantColumn ? [{ propertyName: 'tenantId' }] : [{ propertyName: 'id' }] },
  } as unknown as InsertEvent<Record<string, unknown>>;
}

describe('TenantSubscriber.beforeInsert', () => {
  const sub = new TenantSubscriber();

  it('stamps tenantId from the request context when null', () => {
    const e = { tenantId: null } as Record<string, unknown>;
    tenantStorage.run({ tenantId: 5 }, () => sub.beforeInsert(event(e)));
    expect(e.tenantId).toBe(5);
  });

  it('does not override an explicitly-set tenantId', () => {
    const e = { tenantId: 9 } as Record<string, unknown>;
    tenantStorage.run({ tenantId: 5 }, () => sub.beforeInsert(event(e)));
    expect(e.tenantId).toBe(9);
  });

  it('no-ops when the entity has no tenantId column', () => {
    const e = { foo: 1 } as Record<string, unknown>;
    tenantStorage.run({ tenantId: 5 }, () => sub.beforeInsert(event(e, false)));
    expect(e.tenantId).toBeUndefined();
  });

  it('no-ops outside a tenant context (no ALS store)', () => {
    const e = { tenantId: null } as Record<string, unknown>;
    sub.beforeInsert(event(e));
    expect(e.tenantId).toBeNull();
  });
});
