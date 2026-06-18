import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/** POST /orders/guest-lookup — verify identity by order number + email (FR-019). */
export class GuestLookupRequest {
  @IsString() session_token: string;
  @IsString() @MinLength(1) order_number: string;
  @IsEmail() email: string;
}

/** Optional pagination query for widget order lists. */
export class OrderListQuery {
  @IsString() session_token: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() size?: string;
}

/** Session-token query for order detail / tracking. */
export class SessionTokenQuery {
  @IsString() session_token: string;
}

/** POST /webhooks/fulfillment — external fulfillment update (FR-021). */
export class FulfillmentWebhookRequest {
  @IsString() order_id: string;
  @IsString() status: string;
  @IsOptional() @IsString() tracking_number?: string;
  @IsOptional() @IsString() carrier?: string;
}
