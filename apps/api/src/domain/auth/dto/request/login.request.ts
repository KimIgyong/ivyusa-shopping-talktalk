import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../../../global/util/password-policy.util';
import { PASSWORD_MIN_LENGTH } from '../../../../global/constant/security.constant';

/** Request DTO — snake_case (amoeba_code_convention). */
export class LoginRequest {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  // For tenant-user login: which shop. Optional; defaults to the only tenant in dev.
  @IsOptional()
  @IsString()
  shop_domain?: string;

  // For tenant-user login from the per-tenant page (/<slug>). Wins over shop_domain.
  @IsOptional()
  @IsString()
  tenant_slug?: string;
}

export class RefreshRequest {
  @IsString()
  refresh_token: string;
}

export class LogoutRequest {
  // Optional: presenting the refresh token lets the server revoke it (SEC-M1).
  @IsOptional()
  @IsString()
  refresh_token?: string;
}

export class ChangePasswordRequest {
  // Grandfathered passwords may predate the strong-password policy — keep the old floor.
  @IsString()
  @MinLength(6)
  current_password: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @IsStrongPassword()
  new_password: string;
}
