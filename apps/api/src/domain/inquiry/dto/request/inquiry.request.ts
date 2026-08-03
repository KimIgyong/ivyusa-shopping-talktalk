import { IsOptional, IsString } from 'class-validator';

/** POST /inquiries — open a support inquiry from the widget (FR-044). */
export class CreateInquiryRequest {
  @IsString() session_token: string;
  @IsOptional() @IsString() conversation_id?: string;
  @IsOptional() @IsString() order_id?: string;
}

/**
 * Session-token query for widget inquiry list. `session_token` is optional:
 * the widget sends it in the X-Session-Token header (PRV-M7/FE-M3) and
 * @SessionToken() 401s when absent from both header and query.
 */
export class InquiryListQuery {
  @IsOptional() @IsString() session_token?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() size?: string;
}
