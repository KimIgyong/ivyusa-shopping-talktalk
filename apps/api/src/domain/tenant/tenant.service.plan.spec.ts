import { TenantService } from './tenant.service';

/**
 * Plan / issue-workflow add-on changes (REQ-260825). Value validation lives at
 * the DTO edge (@IsIn) — the service's contract is: persist, audit with the
 * old→new transition, return the saved row.
 */
describe('TenantService plan & workflow-mode changes', () => {
  function makeService(tenant: Record<string, unknown>) {
    const tenantRepo = {
      findOne: jest.fn(async () => tenant),
      save: jest.fn(async (t: unknown) => t),
    };
    const audit = { write: jest.fn(async () => undefined) };
    // Only the members these two methods touch are real; the rest are inert.
    // (positions: tenantRepo, cred, user, cfr, jobLabel, usageType, integration, audit, widgetLogo)
    const service = new TenantService(
      tenantRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      audit as never,
      {} as never,
    );
    return { service, tenantRepo, audit };
  }

  it('updatePlan persists the plan and audits the old→new transition', async () => {
    const tenant = { id: 4, plan: 'starter', workflowMode: 'base' };
    const { service, tenantRepo, audit } = makeService(tenant);

    const saved = await service.updatePlan(4, 'growth', 9);

    expect(saved.plan).toBe('growth');
    expect(tenantRepo.save).toHaveBeenCalled();
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'admin',
        actorId: 9,
        action: 'tenant.plan_changed',
        target: expect.stringContaining('starter -> growth'),
      }),
    );
  });

  it('updateWorkflowMode persists the mode and audits the transition', async () => {
    const tenant = { id: 4, plan: 'starter', workflowMode: 'base' };
    const { service, audit } = makeService(tenant);

    const saved = await service.updateWorkflowMode(4, 'native', 9);

    expect(saved.workflowMode).toBe('native');
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant.workflow_mode_changed',
        target: expect.stringContaining('base -> native'),
      }),
    );
  });
});
