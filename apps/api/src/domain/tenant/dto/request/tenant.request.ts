import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

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
