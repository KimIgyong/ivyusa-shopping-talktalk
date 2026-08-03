import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/** POST /orders/guest-lookup — verify identity by order number + email (FR-019). */
export class GuestLookupRequest {
  @IsString() session_token: string;
  @IsString() @MinLength(1) order_number: string;
  @IsEmail() email: string;
}

/**
 * Optional pagination query for widget order lists.
* `session_token` is optional here: the widget sends it in the X-Session-Token
 * header (PRV-M7/FE-M3) and @SessionToken() rejects with 401 when absent from
 * both header and query — a required query field would 400 every header-auth call.
 */
export class OrderListQuery {
  @IsOptional() @IsString() session_token?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() size?: string;
}

/** POST /webhooks/fulfillment — external fulfillment update (FR-021). */
export class FulfillmentWebhookRequest {
  @IsString() order_id: string;
  @IsString() status: string;
  @IsOptional() @IsString() tracking_number?: string;
  @IsOptional() @IsString() carrier?: string;
}
