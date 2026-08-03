import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
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
