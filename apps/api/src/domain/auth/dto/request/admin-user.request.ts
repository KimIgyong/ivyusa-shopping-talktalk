import { IsBoolean, IsEmail, IsIn, IsOptional } from 'class-validator';

/** Invite a platform admin (REQ-260824-Admin-Account-Invite). */
export class InviteAdminRequest {
  @IsEmail() email: string;
  @IsIn(['super_admin', 'admin']) level: 'super_admin' | 'admin';
  /** Mail the temp password with the /admin/login link (best-effort). */
  @IsOptional() @IsBoolean() send_email?: boolean;
}

export class AdminTempPasswordRequest {
  @IsOptional() @IsBoolean() send_email?: boolean;
}

export class SetAdminStatusRequest {
  @IsIn(['active', 'suspended']) status: 'active' | 'suspended';
}
