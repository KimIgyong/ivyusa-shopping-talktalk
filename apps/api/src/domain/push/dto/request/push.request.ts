import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterPushRequest {
  /** Expo push token, or JSON.stringify(PushSubscription) for webpush
   *  ({endpoint, keys:{p256dh,auth}} — endpoints can exceed 255 chars). */
  @IsString()
  @MaxLength(2048)
  token: string;

  @IsIn(['ios', 'android', 'web'])
  platform: string;

  /** Delivery provider; defaults to 'expo' (existing RN app sends none). */
  @IsOptional()
  @IsIn(['expo', 'webpush'])
  provider?: string;

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
  @MaxLength(2048)
  token: string;
}
