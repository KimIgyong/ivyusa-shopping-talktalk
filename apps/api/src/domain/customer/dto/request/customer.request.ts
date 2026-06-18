import { IsOptional, IsString } from 'class-validator';

/** Request DTOs — snake_case (amoeba_code_convention). */
export class ListCustomersQuery {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsString()
  email?: string;
}

export class UpdateCustomerRequest {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  tier?: string;
}
