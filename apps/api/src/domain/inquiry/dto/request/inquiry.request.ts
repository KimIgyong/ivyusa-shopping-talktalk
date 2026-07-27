import { IsOptional, IsString } from 'class-validator';

/** POST /inquiries — open a support inquiry from the widget (FR-044). */
export class CreateInquiryRequest {
  @IsString() session_token: string;
  @IsOptional() @IsString() conversation_id?: string;
  @IsOptional() @IsString() order_id?: string;
}

/**
 * Session-token query for the widget inquiry list. `session_token` stays OPTIONAL
 * for the same reason as OrderListQuery: `@SessionToken()` resolves it from the
 * `X-Session-Token` header (PRV-M7/FE-M3), so requiring it in the query would 400
 * every real widget request. The decorator still fails closed with 401.
 */
export class InquiryListQuery {
  @IsOptional() @IsString() session_token?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() size?: string;
}
