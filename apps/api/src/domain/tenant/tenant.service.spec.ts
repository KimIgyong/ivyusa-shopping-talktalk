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
      // ContentFilterRule repo — count>0 so any seedDefaultModeration call no-ops.
      { count: jest.fn(async () => 1), save: jest.fn(), create: jest.fn() } as never,
      // JobLabel repo — count>0 so any seedDefaultJobLabels call no-ops.
      { count: jest.fn(async () => 1), save: jest.fn(), create: jest.fn() } as never,
      // UsageType repo — same, for seedDefaultUsageTypes.
      { count: jest.fn(async () => 1), save: jest.fn(), create: jest.fn() } as never,
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

  /** Widget copy merge (PLN-260808-Widget-Greetings): flat fields → JSON blob. */
  describe('updateWidgetSettings widget copy', () => {
    it('folds per-language fields into widget_copy, trimming and dropping empties', async () => {
      const saved = await svc.updateWidgetSettings(1, 7, {
        login_mode: 'redirect',
        display_name: '  IVY 뷰티샵 ',
        first_visit_ko: '어서오세요!',
        first_visit_en: '   ',
        login_greeting_ko: '{name}님 반갑습니다. 무엇을 도와드릴까요?',
      });
      expect(saved.widgetCopy).toEqual({
        displayName: 'IVY 뷰티샵',
        firstVisit: { KO: '어서오세요!' },
        loginGreeting: { KO: '{name}님 반갑습니다. 무엇을 도와드릴까요?' },
      });
    });

    it('PATCH semantics: undefined keeps stored copy, empty clears; all-empty → null', async () => {
      tenant.widgetCopy = {
        displayName: 'Old',
        firstVisit: { EN: 'Hello', KO: '안녕' },
        loginGreeting: {},
      };
      const saved = await svc.updateWidgetSettings(1, 7, {
        login_mode: 'redirect',
        first_visit_en: '', // clear EN only
      });
      expect(saved.widgetCopy).toEqual({
        displayName: 'Old',
        firstVisit: { KO: '안녕' },
        loginGreeting: {},
      });

      const cleared = await svc.updateWidgetSettings(1, 7, {
        login_mode: 'redirect',
        display_name: null,
        first_visit_ko: '',
      });
      expect(cleared.widgetCopy).toBeNull();
    });
  });

  /**
   * Tab configuration (PLN-260817-Widget-Tab-Config). The column is JSON with
   * nothing but this method between a console request and what the widget
   * renders, so normalization and the empty-set refusal are pinned here.
   */
  describe('updateWidgetSettings tab configuration', () => {
    it('stores tabs in canonical order regardless of how they were ticked', async () => {
      const saved = await svc.updateWidgetSettings(1, 7, {
        login_mode: 'redirect',
        tabs: ['chat', 'orders', 'notifications'],
      });
      expect(saved.widgetTabs).toEqual(['notifications', 'orders', 'chat']);
    });

    it('refuses a tab set that renders nothing', async () => {
      // An empty bar leaves the shopper on a panel they cannot navigate away
      // from, so this is a 400 rather than a save that "works".
      await expect(
        svc.updateWidgetSettings(1, 7, { login_mode: 'redirect', tabs: [] }),
      ).rejects.toThrow();
      await expect(
        svc.updateWidgetSettings(1, 7, {
          login_mode: 'redirect',
          tabs: ['ghost'] as never,
        }),
      ).rejects.toThrow();
    });

    it('leaves the stored configuration alone when the request omits it', async () => {
      tenant.widgetTabs = ['notifications', 'orders'];
      tenant.widgetTabPosition = 'bottom';
      const saved = await svc.updateWidgetSettings(1, 7, { login_mode: 'popup' });
      expect(saved.widgetTabs).toEqual(['notifications', 'orders']);
      expect(saved.widgetTabPosition).toBe('bottom');
    });

    it('records the resulting layout in the audit trail', async () => {
      await svc.updateWidgetSettings(1, 7, {
        login_mode: 'redirect',
        tabs: ['notifications', 'chat'],
        tab_position: 'bottom',
      });
      expect(auditWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'tenant.widget_settings_updated',
          target: expect.stringContaining('tabs:notifications+chat@bottom'),
        }),
      );
    });
  });
});
