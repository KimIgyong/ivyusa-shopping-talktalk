import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsString, ValidateNested } from 'class-validator';
import { ALL_MENU_CODES, MENU_ACCESS_MODE, MENU_PROVISION_MODE, USER_RANK } from '@ivy/types';

const MENU_CODES = [...ALL_MENU_CODES];
const PROVISION_MODES = Object.values(MENU_PROVISION_MODE);
const ACCESS_MODES = Object.values(MENU_ACCESS_MODE);
// Master is excluded on purpose: a tenant that could revoke its own master's
// settings and user-management screens would have no way back in.
const EDITABLE_RANKS = Object.values(USER_RANK).filter((r) => r !== USER_RANK.MASTER);

export class TenantMenuItemRequest {
  @IsString() @IsIn(MENU_CODES) menu_code: string;
  /** 'plan' drops the override row; 'on'/'off' pin it against the plan. */
  @IsString() @IsIn(PROVISION_MODES) mode: string;
}

/**
 * Full replacement of a tenant's menu provisioning. The console always sends
 * every catalog row, so a partial payload cannot silently leave a stale
 * override behind.
 */
export class UpdateTenantMenusRequest {
  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => TenantMenuItemRequest)
  menus: TenantMenuItemRequest[];
}

export class RoleMenuItemRequest {
  @IsString() @IsIn(EDITABLE_RANKS) rank: string;
  @IsString() @IsIn(MENU_CODES) menu_code: string;
  @IsBoolean() allowed: boolean;
}

/** Full replacement of the tenant's rank matrix (master rows are never stored). */
export class UpdateRoleMenusRequest {
  @IsArray()
  @ArrayMaxSize(256)
  @ValidateNested({ each: true })
  @Type(() => RoleMenuItemRequest)
  roles: RoleMenuItemRequest[];
}

export class UserMenuItemRequest {
  @IsString() @IsIn(MENU_CODES) menu_code: string;
  /** 'default' drops the exception row; 'allow'/'deny' pin it against the rank. */
  @IsString() @IsIn(ACCESS_MODES) mode: string;
}

/** Full replacement of one member's exceptions. */
export class UpdateUserMenusRequest {
  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => UserMenuItemRequest)
  menus: UserMenuItemRequest[];
}
