import { IsOptional, IsString } from 'class-validator';

/** POST /inquiries — open a support inquiry from the widget (FR-044). */
export class CreateInquiryRequest {
  @IsString() session_token: string;
  @IsOptional() @IsString() conversation_id?: string;
  @IsOptional() @IsString() order_id?: string;
}

/** Session-token query for widget inquiry list. */
export class InquiryListQuery {
  @IsString() session_token: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() size?: string;
}
