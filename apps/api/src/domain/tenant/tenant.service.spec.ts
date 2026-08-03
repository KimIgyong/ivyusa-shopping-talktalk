import { Repository } from 'typeorm';
import { TenantService } from './tenant.service';
import { Tenant } from './entity/tenant.entity';
import { IntegrationCredential } from './entity/integration-credential.entity';
import { User } from '../user/entity/user.entity';
import { IntegrationService } from '../integration/integration.service';
import { AuditService } from '../audit/audit.service';

/** Tenant privacy-notice settings (PLN-Privacy-Control-Gap Stage 2). */
describe('TenantService.updatePrivacyNotice', () => {
  let tenant: Tenant;
  let auditWrite: jest.Mock;
  let svc: TenantService;

  beforeEach(() => {
    tenant = {
      id: 1,
      uuid: 'u-1',
      shopDomain: 'acme.myshopify.com',
      slug: 'acme',
      name: 'Acme',
      status: 'active',
      plan: null,
      privacyPolicyUrl: null,
      consentNoticeVersion: null,
    } as Tenant;
    auditWrite = jest.fn();

    const tenantRepo = {
      findOne: jest.fn(async () => tenant),
      save: jest.fn(async (t: Tenant) => t),
    } as unknown as Repository<Tenant>;

    svc = new TenantService(
      tenantRepo,
      {} as Repository<IntegrationCredential>,
      {} as Repository<User>,
      {} as IntegrationService,
      { write: auditWrite } as unknown as AuditService,
    );
  });

  it('sets URL and version, audits with the new version as target', async () => {
    const saved = await svc.updatePrivacyNotice(1, 7, {
      privacy_policy_url: 'https://acme.example/privacy',
      consent_notice_version: '2026-08',
    });
    expect(saved.privacyPolicyUrl).toBe('https://acme.example/privacy');
    expect(saved.consentNoticeVersion).toBe('2026-08');
    expect(auditWrite).toHaveBeenCalledWith({
      tenantId: 1,
      actorType: 'user',
      actorId: 7,
      action: 'tenant.privacy_notice_updated',
      target: '2026-08',
    });
  });

  it('audits with the URL host when only the URL is set', async () => {
    await svc.updatePrivacyNotice(1, 7, { privacy_policy_url: 'https://acme.example/privacy?x=1' });
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'acme.example' }),
    );
  });

  it('PATCH semantics: omitted fields stay, null clears to platform default', async () => {
    tenant.privacyPolicyUrl = 'https://old.example/privacy';
    tenant.consentNoticeVersion = 'v1';
    const saved = await svc.updatePrivacyNotice(1, 7, { consent_notice_version: null });
    expect(saved.privacyPolicyUrl).toBe('https://old.example/privacy'); // untouched
    expect(saved.consentNoticeVersion).toBeNull(); // cleared → fallback applies
  });
});
