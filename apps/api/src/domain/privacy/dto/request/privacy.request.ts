import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

// ---- Shopify GDPR webhook payloads (snake_case as delivered by Shopify) ----

export class ShopifyCustomerRef {
  @IsOptional() @IsString() email?: string | null;
  @IsOptional() id?: string | number | null;
}

export class CustomersDataRequest {
  @IsOptional() @IsString() shop_domain?: string;
  @IsOptional() @IsObject() customer?: ShopifyCustomerRef;
}

export class CustomersRedactRequest {
  @IsOptional() @IsString() shop_domain?: string;
  @IsOptional() @IsObject() customer?: ShopifyCustomerRef;
}

export class ShopRedactRequest {
  @IsOptional() @IsString() shop_domain?: string;
}

// ---- Widget-facing DSAR / CCPA payloads ----

export class DsarDeleteRequest {
  @IsString() session_token: string;
  @IsBoolean() confirm: boolean;
}

export class OptOutRequest {
  @IsString() session_token: string;
  @IsBoolean() opt_out: boolean;
}
