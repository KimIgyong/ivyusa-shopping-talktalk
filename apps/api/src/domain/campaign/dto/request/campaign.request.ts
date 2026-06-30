import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateCampaignRequest {
  @IsString() name: string;
  @IsOptional() @IsString() segment_ref?: string;
  @IsOptional() @IsObject() content?: Record<string, unknown>;
}

export class UpdateCampaignRequest {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() segment_ref?: string;
  @IsOptional() @IsObject() content?: Record<string, unknown>;
  @IsOptional() @IsString() status?: string;
}
