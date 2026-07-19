import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal } from '@ivy/types';
import { normalizePage, buildPagination } from '@ivy/common';
import { AgentService } from './agent.service';
import { AgentAlertService } from './agent-alert.service';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { Paginated } from '../../global/interceptor/transform.interceptor';
import {
  AgentMessageRequest,
  CreateCustomerRequest,
  LinkCustomerRequest,
  ListSessionsQuery,
  ListStatsQuery,
  UpsertProfileRequest,
} from './dto/request/agent.request';
import {
  toAlertResponse,
  toMessageResponse,
  toProfileResponse,
  toSessionResponse,
  toStatResponse,
} from './agent.mapper';
import { ListAlertsQuery } from './dto/request/agent.request';

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
  constructor(
    private readonly agentService: AgentService,
    private readonly alertService: AgentAlertService,
  ) {}

  @Get('alerts')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Escalation alerts for the console alarm modal (FR-S3)' })
  async alerts(@Query() query: ListAlertsQuery) {
    const items = await this.alertService.list(query.status ?? 'new');
    return items.map(toAlertResponse);
  }

  @Post('alerts/:id/ack')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Acknowledge an escalation alert' })
  async ackAlert(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const alert = await this.alertService.ack(id, actorIdOf(user));
    return toAlertResponse(alert);
  }

  @Get('sessions')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'List waiting/agent conversations (session queue)' })
  async sessions(@CurrentUser() user: Principal, @Query() query: ListSessionsQuery) {
    const { page, size } = normalizePage(query.page, query.size);
    const { items, total } = await this.agentService.listSessions(tenantOf(user), page, size);
    return new Paginated(
      items.map(({ conversation, lastMessage, customerName }) =>
        toSessionResponse(conversation, lastMessage, customerName),
      ),
      buildPagination(page, size, total),
    );
  }

  @Get('customers/search')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Search existing customers to link to a chat' })
  async searchCustomers(@CurrentUser() user: Principal, @Query('q') q?: string) {
    return this.agentService.searchCustomers(tenantOf(user), q ?? '');
  }

  @Get('conversations/:id')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Conversation messages + AI briefing (FR-045)' })
  async conversation(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const tenantId = tenantOf(user);
    const messages = await this.agentService.listMessages(id, tenantId);
    // PII-access audit (PRV-H4): the agent sees the transcript + customer panel.
    await this.agentService.auditConversationView(actorIdOf(user), tenantId, id);
    const names = await this.agentService.resolveSenderNames(messages);
    const briefing = await this.agentService.briefing(tenantId, messages);
    const customer = await this.agentService.customerContext(id, tenantId);
    return {
      conversationId: id,
      messages: messages.map((m) =>
        toMessageResponse(m, m.senderId != null ? names.get(String(m.senderId)) ?? null : null),
      ),
      briefing,
      customer,
    };
  }

  @Post('conversations/:id/link-customer')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Link the chat session to an existing customer' })
  async linkCustomer(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: LinkCustomerRequest,
  ) {
    return this.agentService.linkCustomer(id, tenantOf(user), body.customer_id);
  }

  @Post('conversations/:id/create-customer')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Create a new customer from chat info and link it' })
  async createCustomer(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreateCustomerRequest,
  ) {
    return this.agentService.createAndLinkCustomer(id, tenantOf(user), {
      name: body.name,
      email: body.email,
      phone: body.phone,
    });
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
    const agentId = actorIdOf(user);
    const saved = await this.agentService.sendMessage(id, agentId, tenantOf(user), body.body);
    const senderName = await this.agentService.agentName(agentId);
    return toMessageResponse(saved, senderName);
  }

  @Post('conversations/:id/end')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'End the conversation and release the assignment' })
  async end(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const conversation = await this.agentService.end(id, tenantOf(user));
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
