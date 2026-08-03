import { Repository } from 'typeorm';
import { AuditService } from './audit.service';
import { AuditLog } from './entity/audit-log.entity';
import { runWithRequestContext } from '../../global/middleware/request-context.middleware';

describe('AuditService (Stage 4 — request context + system actor)', () => {
  let svc: AuditService;
  let saved: Array<Partial<AuditLog>>;

  beforeEach(() => {
    saved = [];
    const repo = {
      create: jest.fn((e: Partial<AuditLog>) => e as AuditLog),
      save: jest.fn(async (e: AuditLog) => {
        saved.push(e);
        return e;
      }),
    } as unknown as Repository<AuditLog>;
    svc = new AuditService(repo);
  });

  it('auto-fills ip/requestId from the request context and defaults result=success', async () => {
    await runWithRequestContext({ requestId: 'req-ctx-1', ip: '203.0.113.7' }, () =>
      svc.write({ tenantId: 1, actorType: 'user', actorId: 5, action: 'x.y' }),
    );
    expect(saved[0]).toMatchObject({
      tenantId: 1,
      actorType: 'user',
      actorId: 5,
      action: 'x.y',
      ip: '203.0.113.7',
      requestId: 'req-ctx-1',
      result: 'success',
      metadata: null,
    });
  });

  it('explicit ip/requestId/result/metadata win over the ambient context', async () => {
    await runWithRequestContext({ requestId: 'ambient', ip: '198.51.100.1' }, () =>
      svc.write({
        actorType: 'admin',
        actorId: 9,
        action: 'x.z',
        ip: '192.0.2.10',
        requestId: 'explicit-id',
        result: 'denied',
        metadata: { reason: 'test' },
      }),
    );
    expect(saved[0]).toMatchObject({
      ip: '192.0.2.10',
      requestId: 'explicit-id',
      result: 'denied',
      metadata: { reason: 'test' },
    });
  });

  it("persists the 'system' actor type for machine writers", async () => {
    await svc.write({ actorType: 'system', actorId: 0, action: 'retention.purge' });
    expect(saved[0]).toMatchObject({ actorType: 'system', actorId: 0 });
  });

  it('backward-compat: minimal legacy call outside any request scope', async () => {
    await svc.write({ actorType: 'user', actorId: 3, action: 'legacy.action' });
    expect(saved[0]).toMatchObject({
      tenantId: null,
      actorType: 'user',
      actorId: 3,
      action: 'legacy.action',
      target: null,
      ip: null,
      requestId: null,
      result: 'success',
      metadata: null,
    });
  });
});
