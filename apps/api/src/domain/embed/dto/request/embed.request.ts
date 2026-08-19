import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

/** Request DTOs — snake_case (amoeba_code_convention). */
export class EmbedIdentifyRequest {
  @IsString() session_token: string;
  /** The id the customer's own system uses; length-capped to the stored column. */
  @IsString() @MaxLength(120) user_id: string;
  /** Hex HMAC-SHA256 over `user_id` with the tenant's embed secret. */
  @IsString() @MaxLength(128) hash: string;

  // Profile fields are NOT signed — they fill gaps in the customer record and
  // are never trusted to establish who the visitor is.
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsEmail() @MaxLength(320) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
}
