import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal, USER_RANK } from '@ivy/types';
import { buildPagination, normalizePage } from '@ivy/common';
import { UserService } from './user.service';
import { Paginated } from '../../global/interceptor/transform.interceptor';
import { Public } from '../../global/decorator/public.decorator';
import { RequireCapability, RequireRank } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { asTenantUser } from './user-principal.util';
import {
  AcceptInviteRequest,
  InviteUserRequest,
  UpdateLabelsRequest,
  UpdateRankRequest,
  UpdateStatusRequest,
} from './dto/request/user.request';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @RequireRank(USER_RANK.MASTER, USER_RANK.DIRECTOR, USER_RANK.MANAGER)
  @ApiOperation({ summary: 'List tenant users (paginated) with their job-label codes' })
  async list(
    @CurrentUser() user: Principal,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const principal = asTenantUser(user);
    const { page: p, size: s } = normalizePage(page, size);
    const { items, total } = await this.userService.listUsers(principal.tenantId, p, s);
    return new Paginated(items, buildPagination(p, s, total));
  }

  @Post('invite')
  @RequireCapability(CAPABILITY.USER_INVITE)
  @ApiOperation({ summary: 'Invite a staff member (creates user + invitation)' })
  invite(@CurrentUser() user: Principal, @Body() body: InviteUserRequest) {
    const principal = asTenantUser(user);
    return this.userService.invite(
      principal.tenantId,
      principal.userId,
      body.email,
      body.rank,
      body.label_codes,
    );
  }

  @Post('accept-invite')
  @Public()
  @ApiOperation({ summary: 'Accept an invitation and set a password' })
  acceptInvite(@Body() body: AcceptInviteRequest) {
    return this.userService.acceptInvite(body.token, body.new_password);
  }

  @Post(':id/temp-password')
  @RequireCapability(CAPABILITY.USER_INVITE)
  @ApiOperation({ summary: 'Issue a temporary password for a user (admin hands it off manually)' })
  issueTempPassword(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const actor = asTenantUser(user);
    return this.userService.issueTempPassword(actor.tenantId, id, actor.userId);
  }

  @Patch(':id/rank')
  @RequireCapability(CAPABILITY.USER_RANK_ADJUST)
  @ApiOperation({ summary: 'Adjust a user rank' })
  updateRank(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateRankRequest,
  ) {
    return this.userService.updateRank(asTenantUser(user).tenantId, id, body.rank);
  }

  @Patch(':id/labels')
  @RequireCapability(CAPABILITY.LABEL_ASSIGN)
  @ApiOperation({ summary: 'Replace a user job-label assignments' })
  updateLabels(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateLabelsRequest,
  ) {
    return this.userService.updateLabels(asTenantUser(user).tenantId, id, body.label_codes);
  }

  @Patch(':id/status')
  @RequireRank(USER_RANK.MASTER, USER_RANK.DIRECTOR)
  @ApiOperation({ summary: 'Activate or suspend a user' })
  updateStatus(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateStatusRequest,
  ) {
    return this.userService.updateStatus(asTenantUser(user).tenantId, id, body.status);
  }
}
