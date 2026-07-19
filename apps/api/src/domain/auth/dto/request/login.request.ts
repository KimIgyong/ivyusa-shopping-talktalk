import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

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
  @IsString()
  @MinLength(6)
  current_password: string;

  @IsString()
  @MinLength(8)
  new_password: string;
}
