import { IsString, Length, MinLength } from 'class-validator';

/** Request DTOs — snake_case (amoeba_code_convention). */

/** Step-up verification: the mfa_token IS the credential (route is @Public). */
export class MfaVerifyRequest {
  @IsString()
  mfa_token: string;

  /** 6-digit TOTP or a recovery code (`xxxxx-xxxxx`). */
  @IsString()
  @Length(6, 11)
  code: string;
}

export class MfaEnrollVerifyRequest {
  /** 6-digit TOTP from the freshly enrolled authenticator app. */
  @IsString()
  @Length(6, 6)
  code: string;
}

export class MfaDisableRequest {
  @IsString()
  @MinLength(6)
  password: string;

  /** 6-digit TOTP or a recovery code (`xxxxx-xxxxx`). */
  @IsString()
  @Length(6, 11)
  code: string;
}
