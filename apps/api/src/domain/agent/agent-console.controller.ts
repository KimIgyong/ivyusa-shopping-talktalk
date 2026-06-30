import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal } from '@ivy/types';
import { normalizePage, buildPagination } from '@ivy/common';
import { AgentService } from './agent.service';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { Paginated } from '../../global/interceptor/transform.interceptor';
import {
  AgentMessageRequest,
  ListSessionsQuery,
  ListStatsQuery,
  UpsertProfileRequest,
} from './dto/request/agent.request';
import {
  toMessageResponse,
  toProfileResponse,
  toSessionResponse,
  toStatResponse,
} from './agent.mapper';

function tenantOf(user: Principal): number {
  return user.actorType === 'user' ? user.tenantId : 0;
}
function actorIdOf(user: Principal): number {
  return user.actorType === 'user' ? user.userId : user.adminId;
}

/** Agent console & profile endpoints (FR-066/067, FR-045). */
@ApiTags('Agent')
@Controller('agent')
export class AgentConsoleController {
  constructor(private readonly agentService: AgentService) {}

  @Get('sessions')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'List waiting/agent conversations (session queue)' })
  async sessions(@Query() query: ListSessionsQuery) {
    const { page, size } = normalizePage(query.page, query.size);
    const { items, total } = await this.agentService.listSessions(page, size);
    return new Paginated(
      items.map(({ conversation, lastMessage }) => toSessionResponse(conversation, lastMessage)),
      buildPagination(page, size, total),
    );
  }

  @Get('conversations/:id')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Conversation messages + AI briefing (FR-045)' })
  async conversation(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const messages = await this.agentService.listMessages(id);
    const briefing = await this.agentService.briefing(tenantOf(user), messages);
    return {
      conversationId: id,
      messages: messages.map(toMessageResponse),
      briefing,
    };
  }

  @Post('conversations/:id/accept')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Accept / take over a conversation' })
  async accept(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const conversation = await this.agentService.accept(id, actorIdOf(user), tenantOf(user));
    return { id: conversation.id, status: conversation.status, agentId: conversation.agentId };
  }

  @Post('conversations/:id/message')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Send a moderated agent message (FR-069)' })
  async message(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AgentMessageRequest,
  ) {
    const saved = await this.agentService.sendMessage(id, actorIdOf(user), tenantOf(user), body.body);
    return toMessageResponse(saved);
  }

  @Post('conversations/:id/end')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'End the conversation and release the assignment' })
  async end(@Param('id', ParseIntPipe) id: number) {
    const conversation = await this.agentService.end(id);
    return { id: conversation.id, status: conversation.status, endedAt: conversation.endedAt };
  }

  @Get('profile')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Get the current agent profile' })
  async getProfile(@CurrentUser() user: Principal) {
    const profile = await this.agentService.getProfile(actorIdOf(user));
    return profile ? toProfileResponse(profile) : null;
  }

  @Put('profile')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Upsert the current agent profile' })
  async upsertProfile(@CurrentUser() user: Principal, @Body() body: UpsertProfileRequest) {
    const profile = await this.agentService.upsertProfile(actorIdOf(user), tenantOf(user), body);
    return toProfileResponse(profile);
  }

  @Get('stats')
  @RequireCapability(CAPABILITY.ANALYTICS_READ)
  @ApiOperation({ summary: 'Agent daily performance stats (FR-068)' })
  async stats(@CurrentUser() user: Principal, @Query() query: ListStatsQuery) {
    const { page, size } = normalizePage(query.page, query.size);
    const { items, total } = await this.agentService.listStats(tenantOf(user), page, size);
    return new Paginated(items.map(toStatResponse), buildPagination(page, size, total));
  }
}
