import { IsEmail, IsString, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../../../global/util/password-policy.util';
import { PASSWORD_MIN_LENGTH } from '../../../../global/constant/security.constant';

/**
 * Self-service password recovery from the tenant login page (PLN-260824).
 * Both endpoints are @Public() — the caller proves identity with the account
 * email (temp-request: possession of the mailbox) or the current password
 * (change). Request DTOs are snake_case per convention.
 */
export class TempPasswordSelfRequest {
  // The login page always knows its slug; requiring it keeps the lookup
  // tenant-scoped (no cross-tenant probing by bare email).
  @IsString()
  @MinLength(1)
  tenant_slug: string;

  @IsEmail()
  email: string;
}

export class PasswordChangeSelfRequest {
  @IsString()
  @MinLength(1)
  tenant_slug: string;

  @IsEmail()
  email: string;

  // Grandfathered/temp passwords may predate the strong policy — old floor only.
  @IsString()
  @MinLength(6)
  current_password: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @IsStrongPassword()
  new_password: string;
}
