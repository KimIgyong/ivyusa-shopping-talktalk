import { Body, Controller, Get, HttpStatus, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal } from '@ivy/types';
import { IssueService } from './issue.service';
import { IssueMapper } from './issue.mapper';
import { AssignIssueRequest, TransitionIssueRequest } from './dto/request/issue.request';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Console issue endpoints (PLN-260808-Issue-Workflow-P1; kanban list comes in P4). */
@ApiTags('Issues')
@Controller('agent/issues')
export class IssueController {
  constructor(private readonly issueService: IssueService) {}

  @Get('by-conversation/:conversationId')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: "The conversation's issue for the thread header (null if none)" })
  async byConversation(
    @CurrentUser() user: Principal,
    @Param('conversationId', ParseIntPipe) conversationId: number,
  ) {
    const issue = await this.issueService.findByConversation(this.tenant(user).tenantId, conversationId);
    return { issue: issue ? IssueMapper.toIssue(issue) : null };
  }

  @Post(':id/transition')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Transition an issue (resolve/reject/close/reopen) — 결정 3·10' })
  async transition(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: TransitionIssueRequest,
  ) {
    const u = this.tenant(user);
    const issue = await this.issueService.transition(
      { userId: u.userId, rank: u.rank },
      u.tenantId,
      id,
      body.to,
      { rejectReason: body.reject_reason, note: body.note },
    );
    return IssueMapper.toIssue(issue);
  }

  @Post(':id/assign')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Transfer/reassign an issue to another agent (P2, manager+)' })
  async assign(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AssignIssueRequest,
  ) {
    const u = this.tenant(user);
    const issue = await this.issueService.assign(
      { userId: u.userId, rank: u.rank },
      u.tenantId,
      id,
      body.user_id,
    );
    return IssueMapper.toIssue(issue);
  }

  @Get(':id/events')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Issue timeline (append-only events)' })
  async events(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const events = await this.issueService.listEvents(this.tenant(user).tenantId, id);
    return { events: events.map((e) => IssueMapper.toEvent(e)) };
  }

  private tenant(user: Principal): { tenantId: number; userId: number; rank: string } {
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return { tenantId: user.tenantId, userId: user.userId, rank: user.rank };
  }
}
