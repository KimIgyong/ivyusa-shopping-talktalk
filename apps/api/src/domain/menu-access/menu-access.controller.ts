import { Body, Controller, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal } from '@ivy/types';
import { Auth, RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { asTenantUser } from '../user/user-principal.util';
import { MenuAccessService } from './menu-access.service';
import { UpdateRoleMenusRequest, UpdateUserMenusRequest } from './dto/request/menu-access.request';

@ApiTags('MenuAccess')
@Controller('menu-access')
export class MenuAccessController {
  constructor(private readonly menuAccessService: MenuAccessService) {}

  /**
   * The console asks for this on load and renders its nav from the answer, so
   * what a user sees and what the API will actually serve them come from the
   * same judgement (PLN-260812 S1).
   */
  @Get('me')
  @Auth()
  @ApiOperation({ summary: 'Menus the signed-in tenant user can reach' })
  async myMenus(@CurrentUser() principal: Principal) {
    const user = asTenantUser(principal);
    return { menus: await this.menuAccessService.effectiveMenus(user) };
  }

  // ---- Tenant administration (PLN-260812 S3, layer ②) ----
  // TENANT_SETTINGS_MANAGE is master-only in the capability matrix, which is
  // the intended audience: delegating screens is an owner decision.

  @Get('roles')
  @RequireCapability(CAPABILITY.TENANT_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Rank x menu matrix for this tenant' })
  async roles(@CurrentUser() principal: Principal) {
    return this.menuAccessService.roleMatrixView(asTenantUser(principal).tenantId);
  }

  @Put('roles')
  @RequireCapability(CAPABILITY.TENANT_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Replace the rank x menu matrix for this tenant' })
  async saveRoles(@CurrentUser() principal: Principal, @Body() body: UpdateRoleMenusRequest) {
    const user = asTenantUser(principal);
    return this.menuAccessService.saveRoleMatrix(user.tenantId, body.roles, user.userId);
  }

  @Get('users')
  @RequireCapability(CAPABILITY.TENANT_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Per-member menu exceptions for this tenant' })
  async users(@CurrentUser() principal: Principal) {
    return this.menuAccessService.userOverridesView(asTenantUser(principal).tenantId);
  }

  @Put('users/:userId')
  @RequireCapability(CAPABILITY.TENANT_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Replace one member menu exceptions' })
  async saveUser(
    @CurrentUser() principal: Principal,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: UpdateUserMenusRequest,
  ) {
    const user = asTenantUser(principal);
    return this.menuAccessService.saveUserOverrides(user.tenantId, userId, body.menus, user.userId);
  }
}
