import { Tenant } from './entity/tenant.entity';
import { IntegrationCredential } from './entity/integration-credential.entity';
import { IntegrationStatusEntity } from '../integration/entity/integration-status.entity';
import {
  EXTERNAL_CHANNELS,
  normalizeWidgetTheme,
  NOTIFICATION_CATEGORY,
  WIDGET_LOGIN_MODE,
  WIDGET_TAB_POSITION,
  WIDGET_TABS_DEFAULT,
  normalizeWidgetTabs,
  DEFAULT_BRAND,
} from '@ivy/types';
import {
  CredentialResponse,
  PrivacyNoticeResponse,
  PublicTenantResponse,
  ShopifySettingsResponse,
  TenantResponse,
  StorefrontResponse,
  NotificationChannelsResponse,
  WidgetThemeResponse,
  WidgetSettingsResponse,
} from './dto/response/tenant.response';
import { defaultOrigins } from '../embed/embed-origin.util';

/** Entity -> response mapping. Keeps secrets out of API payloads. */
/** The built-in brand colour — what an unthemed widget renders (index.css). */
// DEFAULT_BRAND now lives with the theme contract in @ivy/types, so the console
// preview, the API and the widget cannot disagree about the unthemed palette.

export class TenantMapper {
  static toTenant(t: Tenant, userCount?: number): TenantResponse {
    return {
      id: t.id,
      uuid: t.uuid,
      shopDomain: t.shopDomain,
      slug: t.slug,
      name: t.name,
      status: t.status,
      plan: t.plan,
      ...(userCount !== undefined ? { userCount } : {}),
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  static toTenantList(tenants: Tenant[], counts?: Map<number, number>): TenantResponse[] {
    return tenants.map((t) => this.toTenant(t, counts?.get(Number(t.id)) ?? (counts ? 0 : undefined)));
  }

  /** Unauthenticated login-page view — never add fields beyond display-safe ones. */
  static toPublicTenant(t: Tenant): PublicTenantResponse {
    return { slug: t.slug, name: t.name, status: t.status };
  }

  /** Tenant privacy-notice settings (stored values; null = platform default). */
  static toPrivacyNotice(t: Tenant): PrivacyNoticeResponse {
    return {
      privacyPolicyUrl: t.privacyPolicyUrl,
      consentNoticeVersion: t.consentNoticeVersion,
    };
  }

  /** Widget behavior settings; anything but an explicit 'popup' reads as redirect. */
  static toStorefront(t: Tenant): StorefrontResponse {
    return { storefrontUrl: t.storefrontUrl };
  }

  static toWidgetSettings(t: Tenant): WidgetSettingsResponse {
    return {
      loginMode:
        t.widgetLoginMode === WIDGET_LOGIN_MODE.POPUP
          ? WIDGET_LOGIN_MODE.POPUP
          : WIDGET_LOGIN_MODE.REDIRECT,
      // Resolve the default here so the console never has to know what it is.
      tabs: normalizeWidgetTabs(t.widgetTabs) ?? [...WIDGET_TABS_DEFAULT],
      tabPosition:
        t.widgetTabPosition === WIDGET_TAB_POSITION.BOTTOM
          ? WIDGET_TAB_POSITION.BOTTOM
          : WIDGET_TAB_POSITION.TOP,
      timezone: t.timezone ?? null,
      displayName: t.widgetCopy?.displayName ?? null,
      firstVisit: t.widgetCopy?.firstVisit ?? {},
      loginGreeting: t.widgetCopy?.loginGreeting ?? {},
      displayNameFallback: t.name ?? null,
    };
  }

  /** Delivery policy + the axes the console renders. */
  static toNotificationChannels(t: Tenant): NotificationChannelsResponse {
    return {
      channels: t.notificationChannels ?? {},
      categories: Object.values(NOTIFICATION_CATEGORY).filter((c) => c !== 'all'),
      channelKeys: [...EXTERNAL_CHANNELS],
    };
  }

  static toWidgetTheme(t: Tenant): WidgetThemeResponse {
    return {
      theme: normalizeWidgetTheme(t.widgetTheme),
      defaultBrand: DEFAULT_BRAND,
      // The console builds the public logo URL from this; it is the same key the
      // widget sends, so both fetch the identical asset.
      shopDomain: t.shopDomain ?? null,
    };
  }

  /**
   * Embed settings for the console (PLN-260819). `origins` is what is STORED —
   * null when never configured — and `effectiveOrigins` is what the gate will
   * actually compare against, so the screen can say which one is in force
   * instead of showing an empty box that silently means "storefront only".
   */
  static toEmbedSettings(t: Tenant): {
    origins: string[] | null;
    effectiveOrigins: string[];
    secretConfigured: boolean;
    shopDomain: string | null;
  } {
    return {
      origins: t.embedOrigins ?? null,
      effectiveOrigins: t.embedOrigins?.length ? t.embedOrigins : defaultOrigins(t),
      secretConfigured: !!t.embedSecret,
      shopDomain: t.shopDomain ?? null,
    };
  }

  static toCredential(c: IntegrationCredential): CredentialResponse {
    return {
      provider: c.provider,
      status: c.status,
      configured: c.secretEnc != null,
      updatedAt: c.updatedAt ?? null,
    };
  }

  static toCredentialList(creds: IntegrationCredential[]): CredentialResponse[] {
    return creds.map((c) => this.toCredential(c));
  }

  static toShopifySettings(
    tenant: Tenant,
    cred: IntegrationCredential | null,
    status: IntegrationStatusEntity | null,
  ): ShopifySettingsResponse {
    return {
      shopDomain: tenant.shopDomain,
      name: tenant.name,
      status: tenant.status,
      credential: {
        configured: cred?.secretEnc != null,
        updatedAt: cred?.updatedAt ?? null,
      },
      integration: {
        status: status?.status ?? null,
        lastSyncAt: status?.lastSyncAt ?? null,
        detail: status?.detail ?? null,
      },
    };
  }
}
