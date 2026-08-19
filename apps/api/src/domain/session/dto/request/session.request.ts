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
}

export class ConsentRequest {
  @IsString() session_token: string;
  @IsBoolean() granted: boolean;
}

export class LanguageRequest {
  @IsString() session_token: string;
  @IsString() language: string;
}
