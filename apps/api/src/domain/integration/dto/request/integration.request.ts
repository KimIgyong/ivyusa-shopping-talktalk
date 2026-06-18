import { IsOptional, IsString, MinLength } from 'class-validator';

/** Request DTO — snake_case (amoeba_code_convention). */
export class UpsertIntegrationStatusRequest {
  @IsString()
  @MinLength(1)
  status: string;

  @IsOptional()
  @IsString()
  detail?: string;
}
