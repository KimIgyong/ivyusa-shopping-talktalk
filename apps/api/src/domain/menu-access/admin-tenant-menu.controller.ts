import { Body, Controller, Get, HttpStatus, Param, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Principal } from '@ivy/types';
import { AdminOnly } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { MenuAccessService } from './menu-access.service';
import { UpdateTenantMenusRequest } from './dto/request/menu-access.request';

/**
 * Platform-admin control of which console menus a tenant is provisioned
 * (PLN-260812 S2, layer ①). Sits above everything the tenant itself can
 * configure: a menu withheld here is invisible to that tenant's master too.
 *
 * Addressed by tenant UUID, matching the other admin tenant routes.
 */
@ApiTags('Admin - Tenant Menus')
@Controller('tenants/:tenantUuid/menus')
export class AdminTenantMenuController {
  constructor(private readonly menuAccessService: MenuAccessService) {}

  @Get()
  @AdminOnly()
  @ApiOperation({ summary: '[Admin] Menu provisioning for a tenant (plan default + override)' })
  async get(@Param('tenantUuid') tenantUuid: string) {
    return this.menuAccessService.tenantMenusView(tenantUuid);
  }

  @Put()
  @AdminOnly()
  @ApiOperation({ summary: '[Admin] Replace a tenant menu provisioning overrides' })
  async update(
    @CurrentUser() admin: Principal,
    @Param('tenantUuid') tenantUuid: string,
    @Body() body: UpdateTenantMenusRequest,
  ) {
    // @AdminOnly guarantees an admin actor at runtime; narrow for TS.
    if (admin.actorType !== 'admin') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return this.menuAccessService.saveTenantMenus(tenantUuid, body.menus, admin.adminId);
  }
}
