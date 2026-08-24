import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ADMIN_LEVEL, Principal } from '@ivy/types';
import { AdminUserService } from './admin-user.service';
import { toAdminUserResponse } from './admin-user.mapper';
import { AdminOnly } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import {
  AdminTempPasswordRequest,
  InviteAdminRequest,
  SetAdminStatusRequest,
} from './dto/request/admin-user.request';

function adminIdOf(user: Principal): number {
  return user.actorType === 'admin' ? Number(user.adminId) : 0;
}

/**
 * Platform-admin account management (REQ-260824-Admin-Account-Invite).
 * Every route is super_admin-only — the first real use of the level argument
 * on @AdminOnly, matching the reserved admin_account.manage grant.
 */
@ApiTags('AdminUsers')
@Controller('admin-users')
export class AdminUserController {
  constructor(private readonly adminUsers: AdminUserService) {}

  @Get()
  @AdminOnly(ADMIN_LEVEL.SUPER_ADMIN)
  @ApiOperation({ summary: 'List platform admin accounts' })
  async list() {
    const rows = await this.adminUsers.list();
    return rows.map(toAdminUserResponse);
  }

  @Post('invite')
  @AdminOnly(ADMIN_LEVEL.SUPER_ADMIN)
  @ApiOperation({ summary: 'Invite a platform admin (temp password, shown once)' })
  async invite(@CurrentUser() user: Principal, @Body() body: InviteAdminRequest) {
    return this.adminUsers.invite(adminIdOf(user), body.email, body.level, body.send_email);
  }

  @Post(':id/temp-password')
  @AdminOnly(ADMIN_LEVEL.SUPER_ADMIN)
  @ApiOperation({ summary: 'Issue a fresh temp password (also clears a login lock)' })
  async tempPassword(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AdminTempPasswordRequest,
  ) {
    return this.adminUsers.issueTempPassword(adminIdOf(user), id, body.send_email);
  }

  @Patch(':id/status')
  @AdminOnly(ADMIN_LEVEL.SUPER_ADMIN)
  @ApiOperation({ summary: 'Activate/deactivate an admin (last super admin protected)' })
  async setStatus(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SetAdminStatusRequest,
  ) {
    const admin = await this.adminUsers.setStatus(adminIdOf(user), id, body.status);
    return toAdminUserResponse(admin);
  }
}
