import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/** POST /orders/guest-lookup — verify identity by order number + email (FR-019). */
export class GuestLookupRequest {
  @IsString() session_token: string;
  @IsString() @MinLength(1) order_number: string;
  @IsEmail() email: string;
}

/**
 * Optional pagination query for widget order lists.
 *
 * `session_token` must stay OPTIONAL here: `@SessionToken()` is the authority and
 * prefers the `X-Session-Token` header (PRV-M7/FE-M3 keeps the token out of URLs),
 * so the widget's GETs carry no `session_token` param at all. Requiring it made
 * the ValidationPipe reject those requests with 400 before the handler ran. A
 * missing token still fails closed — the decorator throws 401.
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
