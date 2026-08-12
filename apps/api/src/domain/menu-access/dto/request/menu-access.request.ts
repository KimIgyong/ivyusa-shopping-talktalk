import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsString, ValidateNested } from 'class-validator';
import { ALL_MENU_CODES, MENU_PROVISION_MODE } from '@ivy/types';

const MENU_CODES = [...ALL_MENU_CODES];
const PROVISION_MODES = Object.values(MENU_PROVISION_MODE);

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
