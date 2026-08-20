import { IsBoolean, IsOptional, IsString } from 'class-validator';

/** Request DTOs — snake_case (amoeba_code_convention). */
export class EnsureSessionRequest {
  @IsOptional() @IsString() session_token?: string;
  @IsOptional() @IsString() locale?: string;
  @IsOptional() @IsString() shop_domain?: string;
  /**
   * Origin of the page hosting the widget (PLN-260819 S1). Optional: loaders
   * already installed on live storefronts do not send it, and their absence must
   * not be read as a violation.
   */
  @IsOptional() @IsString() parent_origin?: string;
  /**
   * AI agent code from the embed snippet's `data-agent` (PLN-260820). Unknown
   * or inactive codes fall back to the tenant's default agent — a typo in a
   * snippet must never take the widget down.
   */
  @IsOptional() @IsString() agent_code?: string;
}

export class ConsentRequest {
  @IsString() session_token: string;
  @IsBoolean() granted: boolean;
}

export class LanguageRequest {
  @IsString() session_token: string;
  @IsString() language: string;
}
