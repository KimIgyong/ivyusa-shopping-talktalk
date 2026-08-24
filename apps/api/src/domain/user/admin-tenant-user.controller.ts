import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HttpStatus } from '@nestjs/common';
import { Principal } from '@ivy/types';
import { buildPagination, normalizePage } from '@ivy/common';
import { UserService } from './user.service';
import { IssueTempPasswordRequest } from './dto/request/user.request';
import { MfaService } from '../auth/mfa.service';
import { TenantService } from '../tenant/tenant.service';
import { Paginated } from '../../global/interceptor/transform.interceptor';
import { AdminOnly } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { InviteUserRequest, UpdateStatusRequest } from './dto/request/user.request';

/**
 * Platform-admin view of a tenant's staff (tenant console keeps its own
 * /users routes). Tenants are addressed by their external UUID — the numeric
 * PK never appears in admin URLs. Lets the system admin bootstrap the first
 * master account after approving a tenant and manage accounts across tenants.
 */
@ApiTags('Admin - Tenant Users')
@Controller('tenants/:tenantUuid')
export class AdminTenantUserController {
  constructor(
    private readonly userService: UserService,
    private readonly mfaService: MfaService,
    private readonly tenantService: TenantService,
  ) {}

  @Get('users')
  @AdminOnly()
  @ApiOperation({ summary: '[Admin] List a tenant users (paginated)' })
  async list(
    @Param('tenantUuid') tenantUuid: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const tenant = await this.tenantService.getByUuid(tenantUuid); // 404 on unknown tenant
    const { page: p, size: s } = normalizePage(page, size);
    const { items, total } = await this.userService.listUsers(Number(tenant.id), p, s);
    return new Paginated(items, buildPagination(p, s, total));
  }

  @Get('job-labels')
  @AdminOnly()
  @ApiOperation({ summary: '[Admin] List a tenant job labels' })
  async listLabels(@Param('tenantUuid') tenantUuid: string) {
    const tenant = await this.tenantService.getByUuid(tenantUuid);
    return this.userService.listLabels(Number(tenant.id));
  }

  @Post('users/invite')
  @AdminOnly()
  @ApiOperation({ summary: '[Admin] Invite a user into a tenant (returns one-time temp password)' })
  async invite(
    @CurrentUser() admin: Principal,
    @Param('tenantUuid') tenantUuid: string,
    @Body() body: InviteUserRequest,
  ) {
    const tenant = await this.tenantService.getByUuid(tenantUuid);
    return this.userService.invite(
      Number(tenant.id),
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
  async issueTempPassword(
    @CurrentUser() admin: Principal,
    @Param('tenantUuid') tenantUuid: string,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body?: IssueTempPasswordRequest,
  ) {
    const tenant = await this.tenantService.getByUuid(tenantUuid);
    return this.userService.issueTempPassword(Number(tenant.id), userId, this.adminId(admin), 'admin', {
      sendEmail: body?.send_email === true,
    });
  }

  @Post('users/:userId/mfa-reset')
  @AdminOnly()
  @ApiOperation({ summary: '[Admin] Reset a tenant user MFA credential (re-enrolls at next login)' })
  async resetMfa(
    @CurrentUser() admin: Principal,
    @Param('tenantUuid') tenantUuid: string,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    const tenant = await this.tenantService.getByUuid(tenantUuid);
    this.adminId(admin); // hard runtime guarantee the actor is an admin
    return this.mfaService.resetForUser(Number(tenant.id), userId, admin);
  }

  @Patch('users/:userId/status')
  @AdminOnly()
  @ApiOperation({ summary: '[Admin] Activate or suspend a tenant user' })
  async updateStatus(
    @Param('tenantUuid') tenantUuid: string,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: UpdateStatusRequest,
  ) {
    const tenant = await this.tenantService.getByUuid(tenantUuid);
    return this.userService.updateStatus(Number(tenant.id), userId, body.status);
  }

  private adminId(principal: Principal): number {
    if (principal.actorType !== 'admin') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return principal.adminId;
  }
}
