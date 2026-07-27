import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HttpStatus } from '@nestjs/common';
import { Principal } from '@ivy/types';
import { buildPagination, normalizePage } from '@ivy/common';
import { UserService } from './user.service';
import { TenantService } from '../tenant/tenant.service';
import { Paginated } from '../../global/interceptor/transform.interceptor';
import { AdminOnly } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { InviteUserRequest, UpdateStatusRequest } from './dto/request/user.request';

/**
 * Platform-admin view of a tenant's staff (tenant console keeps its own
 * /users routes). Lets the system admin bootstrap the first master account
 * after approving a tenant and manage accounts across tenants.
 */
@ApiTags('Admin - Tenant Users')
@Controller('tenants/:tenantId')
export class AdminTenantUserController {
  constructor(
    private readonly userService: UserService,
    private readonly tenantService: TenantService,
  ) {}

  @Get('users')
  @AdminOnly()
  @ApiOperation({ summary: '[Admin] List a tenant users (paginated)' })
  async list(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    await this.tenantService.findById(tenantId); // 404 on unknown tenant
    const { page: p, size: s } = normalizePage(page, size);
    const { items, total } = await this.userService.listUsers(tenantId, p, s);
    return new Paginated(items, buildPagination(p, s, total));
  }

  @Get('job-labels')
  @AdminOnly()
  @ApiOperation({ summary: '[Admin] List a tenant job labels' })
  async listLabels(@Param('tenantId', ParseIntPipe) tenantId: number) {
    await this.tenantService.findById(tenantId);
    return this.userService.listLabels(tenantId);
  }

  @Post('users/invite')
  @AdminOnly()
  @ApiOperation({ summary: '[Admin] Invite a user into a tenant (returns one-time temp password)' })
  async invite(
    @CurrentUser() admin: Principal,
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Body() body: InviteUserRequest,
  ) {
    await this.tenantService.findById(tenantId);
    return this.userService.invite(
      tenantId,
      this.adminId(admin),
      body.email,
      body.rank,
      body.label_codes,
      'admin',
    );
  }

  @Post('users/:userId/temp-password')
  @AdminOnly()
  @ApiOperation({ summary: '[Admin] Issue a temporary password for a tenant user' })
  issueTempPassword(
    @CurrentUser() admin: Principal,
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.userService.issueTempPassword(tenantId, userId, this.adminId(admin), 'admin');
  }

  @Patch('users/:userId/status')
  @AdminOnly()
  @ApiOperation({ summary: '[Admin] Activate or suspend a tenant user' })
  updateStatus(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: UpdateStatusRequest,
  ) {
    return this.userService.updateStatus(tenantId, userId, body.status);
  }

  private adminId(principal: Principal): number {
    if (principal.actorType !== 'admin') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return principal.adminId;
  }
}
