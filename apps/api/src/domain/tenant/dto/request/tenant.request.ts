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
