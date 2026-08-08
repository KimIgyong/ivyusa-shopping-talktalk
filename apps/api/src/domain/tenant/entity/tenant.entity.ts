import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** Shape of the `widget_copy` JSON column; languages keyed EN/ES/KO. */
export interface TenantWidgetCopy {
  displayName?: string | null;
  firstVisit?: Record<string, string>;
  loginGreeting?: Record<string, string>;
}

/** tenants — a tenant = a Shopify shop (FR-051). */
@Entity('tenants')
@Unique('uk_tenant_shop', ['shopDomain'])
@Unique('uk_tenant_slug', ['slug'])
@Unique('uk_tenant_uuid', ['uuid'])
export class Tenant {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  // External identifier: admin API/console reference tenants by UUID so the
  // sequential PK never leaks outside the service (PK stays bigint for FKs).
  @Column({ type: 'char', length: 36 })
  uuid: string;

  @Column({ name: 'shop_domain', type: 'varchar', length: 255 })
  shopDomain: string;

  // URL-safe unique handle; the tenant login page lives at /<slug>.
  @Column({ type: 'varchar', length: 64 })
  slug: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: string; // applied/active/suspended

  @Column({ type: 'varchar', length: 32, nullable: true })
  plan: string | null;

  /** Tenant's public privacy-policy page shown in the widget consent banner. */
  @Column({ name: 'privacy_policy_url', type: 'varchar', length: 512, nullable: true })
  privacyPolicyUrl: string | null;

  /**
   * Customer-facing shop origin (e.g. `https://ivyusa.com`).
   *
   * Not `shopDomain`: that holds the Shopify admin domain
   * (`ambshop-dev.myshopify.com`), which shoppers never see, and the second
   * tenant is on cafe24 rather than Shopify.
   *
   * Null until an operator sets it, and that is the safe state: without a known
   * origin there is no way to tell a tenant's own product URL from an arbitrary
   * link that arrived in an uploaded CSV, so product citations render without
   * links rather than pointing customers anywhere.
   */
  @Column({ name: 'storefront_url', type: 'varchar', length: 255, nullable: true })
  storefrontUrl: string | null;

  /**
   * Tenant override of the consent-notice version; null falls back to the
   * platform-wide CONSENT_NOTICE_VERSION. Bumping it forces re-consent
   * (PLN-Privacy-Control-Gap Stage 2).
   */
  @Column({ name: 'consent_notice_version', type: 'varchar', length: 32, nullable: true })
  consentNoticeVersion: string | null;

  /** Widget "Sign in" behavior: 'redirect' (whole-tab, default) or 'popup'. */
  @Column({ name: 'widget_login_mode', type: 'varchar', length: 16, default: 'redirect' })
  widgetLoginMode: string;

  /**
   * Tenant-configurable widget copy (PLN-260808-Widget-Greetings): display name,
   * first-visit welcome, login greeting — per-language JSON blob so future copy
   * additions need no migration. Null/missing fields fall back to widget defaults.
   */
  @Column({ name: 'widget_copy', type: 'json', nullable: true })
  widgetCopy: TenantWidgetCopy | null;

  // IANA timezone (e.g. 'Asia/Seoul', 'America/New_York'). Drives the default
  // widget language when the shopper hasn't picked one (Seoul → ko, US → en).
  @Column({ type: 'varchar', length: 40, nullable: true })
  timezone: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
