import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterPushRequest {
  @IsString()
  @MaxLength(255)
  token: string;

  @IsIn(['ios', 'android'])
  platform: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  locale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  app_version?: string;
}

export class UnregisterPushRequest {
  @IsString()
  @MaxLength(255)
  token: string;
}
