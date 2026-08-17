import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  WIDGET_LOGIN_MODE,
  WIDGET_TAB,
  WIDGET_TAB_POSITION,
  WidgetLoginMode,
  WidgetTab,
  WidgetTabPosition,
} from '@ivy/types';
import { TENANT_SLUG_PATTERN } from '../../../../global/constant/reserved-slug.constant';

/** Request DTOs — snake_case (amoeba_code_convention). */
export class ListTenantsQuery {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsIn(['applied', 'active', 'suspended'])
  status?: string;
}

export class CreateTenantRequest {
  @IsString()
  @MinLength(1)
  shop_domain: string;

  // Login-page path (/<slug>); auto-derived from `name` when omitted.
  @IsOptional()
  @IsString()
  @Matches(TENANT_SLUG_PATTERN)
  slug?: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  plan: string;
}

export class UpdateTenantStatusRequest {
  @IsIn(['applied', 'active', 'suspended'])
  status: string;
}

export class UpsertCredentialRequest {
  @IsString()
  @MinLength(1)
  secret: string;
}

/**
 * Shopify connection settings for the current tenant. `shop_domain` is the shop
 * address; credential fields (optional) are packed into the encrypted `shopify`
 * credential. Sending no credential fields leaves the stored credential untouched.
 */
export class UpdateShopifySettingsRequest {
  @IsString()
  @MinLength(3)
  shop_domain: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  access_token?: string;

  @IsOptional()
  @IsString()
  api_key?: string;

  @IsOptional()
  @IsString()
  api_secret?: string;
}

/**
 * Generic e-commerce integration settings (cafe24 / woocommerce / odoo / haravan).
 * `config` is a provider-specific bag of credential fields (snake_case keys per the
 * shared INTEGRATION_FIELDS schema). Secret fields left empty keep the stored value.
 */
export class UpdateIntegrationRequest {
  @IsObject()
  config: Record<string, string>;
}

/**
 * Tenant privacy-notice settings (PLN-Privacy-Control-Gap Stage 2). Both fields
 * are optional (PATCH semantics); sending null clears the value back to the
 * platform default. Bumping `consent_notice_version` forces widget re-consent.
 */
export class UpdatePrivacyNoticeRequest {
  // Must be an absolute http(s) URL when set; null clears it.
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(512)
  privacy_policy_url?: string | null;

  // Safe charset only (letters/digits . _ -); null falls back to the platform version.
  @IsOptional()
  @IsString()
  @Length(1, 32)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
  consent_notice_version?: string | null;
}

/**
 * Widget behavior settings (PLN-Widget-Login-Redirect-Orders): how the widget's
 * "Sign in" opens the storefront login — whole-tab redirect (default) or popup.
 */
export class UpdateStorefrontRequest {
  /** Customer-facing shop origin. Empty clears it (and disables product links). */
  @IsOptional() @IsString() storefront_url?: string | null;
}

export class UpdateWidgetSettingsRequest {
  @IsIn(Object.values(WIDGET_LOGIN_MODE))
  login_mode: WidgetLoginMode;

  // Which tabs the widget shows (PLN-260817-Widget-Tab-Config). Optional so a
  // copy-only or login-mode-only save leaves the tab configuration alone; the
  // service normalizes order/duplicates and rejects a set that renders no tabs.
  // `ValidateIf(value !== undefined)` rather than `IsOptional()`: IsOptional
  // skips validation for null as well as undefined, so an explicit `null` would
  // sail past IsIn and reach a NOT NULL column as a 500. Omitted still means
  // "leave it alone"; null is simply not a value these accept.
  @ValidateIf((_o, value) => value !== undefined)
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(Object.values(WIDGET_TAB), { each: true })
  tabs?: WidgetTab[];

  @ValidateIf((_o, value) => value !== undefined)
  @IsIn(Object.values(WIDGET_TAB_POSITION))
  tab_position?: WidgetTabPosition;

  // IANA timezone (e.g. 'Asia/Seoul'); drives the default widget language. Empty
  // string / null clears it. Optional so a login-mode-only update leaves it intact.
  @IsOptional()
  @IsString()
  @Matches(/^$|^[A-Za-z]+\/[A-Za-z_+-]+$/)
  timezone?: string | null;

  // Widget copy (PLN-260808-Widget-Greetings). PATCH semantics per field:
  // undefined = keep, ''/null = clear back to the widget default. Flat per-language
  // fields keep validation trivial; the service folds them into the JSON blob.
  @IsOptional() @IsString() @MaxLength(80) display_name?: string | null;
  @IsOptional() @IsString() @MaxLength(500) first_visit_en?: string | null;
  @IsOptional() @IsString() @MaxLength(500) first_visit_es?: string | null;
  @IsOptional() @IsString() @MaxLength(500) first_visit_ko?: string | null;
  @IsOptional() @IsString() @MaxLength(500) first_visit_vi?: string | null;
  @IsOptional() @IsString() @MaxLength(500) first_visit_ja?: string | null;
  @IsOptional() @IsString() @MaxLength(500) first_visit_zh?: string | null;
  @IsOptional() @IsString() @MaxLength(500) login_greeting_en?: string | null;
  @IsOptional() @IsString() @MaxLength(500) login_greeting_es?: string | null;
  @IsOptional() @IsString() @MaxLength(500) login_greeting_ko?: string | null;
  @IsOptional() @IsString() @MaxLength(500) login_greeting_vi?: string | null;
  @IsOptional() @IsString() @MaxLength(500) login_greeting_ja?: string | null;
  @IsOptional() @IsString() @MaxLength(500) login_greeting_zh?: string | null;
}

/**
 * Per-category channel policy (PLN-260817-Widget-Header-Prefs-Cleanup).
 * `{ [category]: channel[] }` — a category left out imposes no ceiling.
 */
export class UpdateNotificationChannelsRequest {
  @IsObject()
  channels: Record<string, string[]>;
}
