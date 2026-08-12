import { Body, Controller, Delete, Get, HttpStatus, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, JobLabel, Principal, UserRank } from '@ivy/types';
import { buildPagination, normalizePage } from '@ivy/common';
import { Paginated } from '../../global/interceptor/transform.interceptor';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { AiCoachService } from './ai-coach.service';
import { CoachProposalService } from './coach-proposal.service';
import { AiCoachMapper } from './ai-coach.mapper';
import {
  ApplyProposalRequest,
  CreateThreadRequest,
  ListThreadsQuery,
  SendCoachMessageRequest,
} from './dto/request/ai-coach.request';

/**
 * Agent coaching channel (FR-071 / FR-072). Distinct from the /ai-setting
 * preview: there the admin plays the shopper, here they talk to the agent about
 * its own behavior and approve the config changes that come out of it.
 */
@ApiTags('AI Coach')
@Controller('ai-coach')
export class AiCoachController {
  constructor(
    private readonly coach: AiCoachService,
    private readonly proposals: CoachProposalService,
  ) {}

  private tenantUser(user: Principal): {
    tenantId: number;
    userId: number;
    rank: UserRank;
    labels: JobLabel[];
  } {
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    // rank/labels ride along because applying a kb_upsert additionally requires
    // KNOWLEDGE_SOURCE_MANAGE, which the route-level guard does not cover.
    return {
      tenantId: user.tenantId,
      userId: user.userId,
      rank: user.rank,
      labels: user.labels ?? [],
    };
  }

  @Get('threads')
  @RequireCapability(CAPABILITY.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'List coaching threads for the tenant' })
  async listThreads(@CurrentUser() user: Principal, @Query() query: ListThreadsQuery) {
    const { tenantId } = this.tenantUser(user);
    const { page, size } = normalizePage(query.page, query.size);
    const { items, total } = await this.coach.listThreads(tenantId, page, size);
    return new Paginated(AiCoachMapper.toThreadList(items), buildPagination(page, size, total));
  }

  @Post('threads')
  @RequireCapability(CAPABILITY.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Start a coaching thread' })
  async createThread(@CurrentUser() user: Principal, @Body() body: CreateThreadRequest) {
    const { tenantId, userId } = this.tenantUser(user);
    const thread = await this.coach.createThread(tenantId, userId, body.title);
    return AiCoachMapper.toThread(thread);
  }

  @Get('threads/:id')
  @RequireCapability(CAPABILITY.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Get a coaching thread with its messages and proposals' })
  async getThread(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const { tenantId } = this.tenantUser(user);
    const { thread, messages, proposals } = await this.coach.getThread(tenantId, id);
    return AiCoachMapper.toThreadDetail(thread, messages, proposals);
  }

  @Post('threads/:id/messages')
  @RequireCapability(CAPABILITY.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Coach the agent; returns its reply and any change proposals' })
  async sendMessage(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SendCoachMessageRequest,
  ) {
    const { tenantId, userId } = this.tenantUser(user);
    const result = await this.coach.sendTurn({
      tenantId,
      userId,
      threadId: id,
      text: body.message,
      refMessageId: body.ref_message_id,
    });
    return {
      message: AiCoachMapper.toMessage(result.message),
      proposals: result.proposals.map((p) => AiCoachMapper.toProposal(p)),
    };
  }

  @Delete('threads/:id')
  @RequireCapability(CAPABILITY.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Archive a coaching thread' })
  async archiveThread(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const { tenantId } = this.tenantUser(user);
    await this.coach.archiveThread(tenantId, id);
    return { archived: true };
  }

  @Post('proposals/:id/apply')
  @RequireCapability(CAPABILITY.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Approve a proposal and write it to the tenant AI config' })
  async applyProposal(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ApplyProposalRequest,
  ) {
    const { tenantId, userId, rank, labels } = this.tenantUser(user);
    const proposal = await this.proposals.apply(tenantId, { userId, rank, labels }, id, {
      persona: body.persona,
      rule: body.rule,
      docContent: body.doc_content,
      scenarioReply: body.scenario_reply,
    });
    return AiCoachMapper.toProposal(proposal);
  }

  @Post('proposals/:id/reject')
  @RequireCapability(CAPABILITY.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Dismiss a proposal without applying it' })
  async rejectProposal(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const { tenantId, userId } = this.tenantUser(user);
    const proposal = await this.proposals.reject(tenantId, userId, id);
    return AiCoachMapper.toProposal(proposal);
  }

  @Post('proposals/:id/revert')
  @RequireCapability(CAPABILITY.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Roll an applied proposal back to the value it replaced' })
  async revertProposal(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const { tenantId, userId } = this.tenantUser(user);
    const proposal = await this.proposals.revert(tenantId, userId, id);
    return AiCoachMapper.toProposal(proposal);
  }
}
