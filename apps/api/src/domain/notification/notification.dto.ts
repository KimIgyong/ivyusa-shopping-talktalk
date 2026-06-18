import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

/** Channels notifications can be delivered on. in_app is always-on/transactional. */
export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'sms', 'web_push'] as const;

export class ReadNotificationRequest {
  @IsString() session_token: string;
}

export class UpdatePrefRequest {
  @IsString() session_token: string;
  @IsString() @IsIn(NOTIFICATION_CHANNELS as unknown as string[]) channel: string;
  @IsString() category: string;
  @IsBoolean() enabled: boolean;
}

/** Input accepted by NotificationService.notify and the EVENTS.NOTIFICATION handler. */
export interface NotifyInput {
  customerId?: number | null;
  sessionId?: number | null;
  category: string;
  title: string;
  body?: string | null;
  statusBadge?: string | null;
  channel?: string | null;
}

export class ListNotificationsQuery {
  @IsString() session_token: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() size?: string;
}
