import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal, USER_RANK } from '@ivy/types';
import { normalizePage, buildPagination } from '@ivy/common';
import { AgentService } from './agent.service';
import { AgentAlertService } from './agent-alert.service';
import { BriefingService } from './briefing.service';
import { ChatCommentService } from './chat-comment.service';
import { AttachmentService, UploadInput } from '../attachment/attachment.service';
import { AttachmentMapper } from '../attachment/attachment.mapper';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { Paginated } from '../../global/interceptor/transform.interceptor';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import {
  AgentMessageRequest,
  CreateCommentRequest,
  CreateCustomerRequest,
  LinkCustomerRequest,
  ConversationQuery,
  ListSessionsQuery,
  ListStatsQuery,
  ApproveDraftRequest,
  SetAutoReplyRequest,
  SetSessionAliasRequest,
  TranslateBriefingRequest,
  UpdateCommentRequest,
  UpsertProfileRequest,
} from './dto/request/agent.request';
import {
  toAlertResponse,
  toBriefingResponse,
  toCommentResponse,
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
    private readonly attachments: AttachmentService,
    private readonly briefingService: BriefingService,
    private readonly commentService: ChatCommentService,
  ) {}

  @Get('alerts')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Escalation alerts for the console alarm modal (FR-S3)' })
  async alerts(@CurrentUser() user: Principal, @Query() query: ListAlertsQuery) {
    // An alert addressed to a specific agent is only shown to that agent;
    // broadcast alerts (target NULL) stay visible to everyone in the SAME
    // tenant (PLN-AiSetting W3, tenant fence REQ-260824 R2).
    const items = await this.alertService.list(query.status ?? 'new', actorIdOf(user), tenantOf(user));
    return items.map(toAlertResponse);
  }

  @Post('alerts/:id/ack')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Acknowledge an escalation alert' })
  async ackAlert(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const alert = await this.alertService.ack(id, actorIdOf(user), tenantOf(user));
    return toAlertResponse(alert);
  }

  @Get('sessions')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'List waiting/agent conversations (session queue)' })
  async sessions(@CurrentUser() user: Principal, @Query() query: ListSessionsQuery) {
    // 50, not the platform default 20: the list now includes live AI threads,
    // and a console that silently truncates the queue is worse than a long one.
    const { page, size } = normalizePage(query.page, query.size ?? '50');
    const scope = query.status === 'queue' || query.status === 'ended' ? query.status : 'all';
    const { items, total } = await this.agentService.listSessions(
      tenantOf(user),
      page,
      size,
      query.q,
      scope,
      query.channel,
    );
    return new Paginated(
      items.map(({ conversation, lastMessage, contact, alias, autoReplyMode, autoReplyEffective }) =>
        toSessionResponse(conversation, lastMessage, contact, alias, {
          mode: autoReplyMode,
          effective: autoReplyEffective,
        }),
      ),
      buildPagination(page, size, total),
    );
  }

  @Patch('conversations/:id/alias')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: "Set or clear the operator's name for this session" })
  async setAlias(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SetSessionAliasRequest,
  ) {
    return this.agentService.setSessionAlias(
      id,
      tenantOf(user),
      actorIdOf(user),
      body.alias ?? null,
    );
  }

  @Patch('conversations/:id/auto-reply')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Set whether the AI answers this session (inherit/on/off)' })
  async setAutoReply(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SetAutoReplyRequest,
  ) {
    return this.agentService.setSessionAutoReply(id, tenantOf(user), actorIdOf(user), body.mode);
  }

  @Post('conversations/:id/draft/approve')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Send the pending AI draft as the agent reply (optionally edited)' })
  async approveDraft(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ApproveDraftRequest,
  ) {
    return this.agentService.approveDraft(id, tenantOf(user), actorIdOf(user), body.body);
  }

  @Post('conversations/:id/draft/discard')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Drop the pending AI draft without sending it' })
  async discardDraft(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    return this.agentService.discardDraft(id, tenantOf(user), actorIdOf(user));
  }

  @Get('customers/search')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Search existing customers to link to a chat' })
  async searchCustomers(@CurrentUser() user: Principal, @Query('q') q?: string) {
    return this.agentService.searchCustomers(tenantOf(user), q ?? '');
  }

  @Get('conversations/:id')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Conversation messages (recent page; older via before_id)' })
  async conversation(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ConversationQuery,
  ) {
    const tenantId = tenantOf(user);
    // The briefing is NOT computed here any more (PLN-260807 D1): it is a model
    // call, and waiting for it kept a two-message conversation on screen for
    // 6-8 seconds. The console fetches it separately, after the transcript.
    const { messages, hasMore } = await this.agentService.listMessages(id, tenantId, {
      limit: query.limit != null ? Number(query.limit) : undefined,
      beforeId: query.before_id != null ? Number(query.before_id) : undefined,
    });
    // PII-access audit (PRV-H4): the agent sees the transcript + customer panel.
    await this.agentService.auditConversationView(actorIdOf(user), tenantId, id);
    const names = await this.agentService.resolveSenderNames(messages);
    // One query for the page — the console re-fetches a conversation on every
    // poll, so a per-message lookup would multiply with the transcript length.
    const attachments = await this.attachments.findByMessageIds(messages.map((m) => Number(m.id)));
    const customer = await this.agentService.customerContext(id, tenantId);
    const conversation = await this.agentService.findConversation(id, tenantId);
    const sessionState = await this.agentService.sessionStateFor(id, conversation.sessionId);
    const draft = await this.agentService.pendingDraft(id, tenantId);
    return {
      conversationId: id,
      // Approval mode: the agent sends this, so it travels with the transcript.
      pendingDraft: draft
        ? {
            id: String(draft.id),
            body: draft.body,
            confidence: draft.confidence,
            createdAt: draft.createdAt,
          }
        : null,
      sessionId: String(conversation.sessionId),
      ...sessionState,
      // Carried on the detail as well as the list row: a deep link from the
      // escalation alarm opens a conversation the filtered list may not hold,
      // and the composer needs the channel to know whether a reply is possible.
      channel: conversation.channel || 'widget',
      status: conversation.status,
      messages: messages.map((m) =>
        toMessageResponse(
          m,
          m.senderId != null ? names.get(String(m.senderId)) ?? null : null,
          attachments.get(String(m.id)),
        ),
      ),
      hasMore,
      customer,
    };
  }

  @Get('conversations/:id/briefing')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Latest stored briefing — read-only, no model call (REQ-260824 R3)' })
  async briefing(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const stored = await this.briefingService.latest(id, tenantOf(user));
    if (!stored) return { briefing: null };
    const name = await this.agentService.agentName(Number(stored.requestedBy));
    return toBriefingResponse(stored, name);
  }

  @Post('conversations/:id/briefing')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Generate and store a briefing on operator request (REQ-260824 R3)' })
  async generateBriefing(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const saved = await this.briefingService.generate(id, tenantOf(user), actorIdOf(user));
    const name = await this.agentService.agentName(Number(saved.requestedBy));
    return toBriefingResponse(saved, name);
  }

  @Post('briefings/:id/translate')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Translate a stored briefing into a system language (REQ-260824 R3)' })
  async translateBriefing(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: TranslateBriefingRequest,
  ) {
    const saved = await this.briefingService.translate(id, tenantOf(user), body.lang);
    const name = await this.agentService.agentName(Number(saved.requestedBy));
    return toBriefingResponse(saved, name);
  }

  @Get('conversations/:id/comments')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Internal notes: this thread + its session (REQ-260824 R4)' })
  async comments(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const { comments, authorNames } = await this.commentService.listFor(id, tenantOf(user));
    return comments.map((c) => toCommentResponse(c, authorNames.get(String(c.authorId)) ?? null));
  }

  @Post('conversations/:id/comments')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Add an internal note to the thread or its session (REQ-260824 R4)' })
  async createComment(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreateCommentRequest,
  ) {
    const authorId = actorIdOf(user);
    const saved = await this.commentService.create(
      id,
      tenantOf(user),
      authorId,
      body.scope,
      body.body,
    );
    // Body length only — the note may name a customer; the audit trail is not
    // a PII store (same rule as agent messages).
    await this.agentService.auditAgentAction(
      authorId,
      tenantOf(user),
      'agent.comment_created',
      `conversation:${id}`,
      { commentId: saved.id, scope: saved.scope, length: saved.body.length },
    );
    const name = await this.agentService.agentName(authorId);
    return toCommentResponse(saved, name);
  }

  @Patch('comments/:id')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Edit an own internal note (REQ-260824 R4)' })
  async updateComment(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCommentRequest,
  ) {
    const userId = actorIdOf(user);
    const saved = await this.commentService.update(id, tenantOf(user), userId, body.body);
    const name = await this.agentService.agentName(userId);
    return toCommentResponse(saved, name);
  }

  @Delete('comments/:id')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Delete an internal note — author or master (REQ-260824 R4)' })
  async deleteComment(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const isMaster = user.actorType === 'user' && user.rank === USER_RANK.MASTER;
    await this.commentService.remove(id, tenantOf(user), actorIdOf(user), isMaster);
    await this.agentService.auditAgentAction(
      actorIdOf(user),
      tenantOf(user),
      'agent.comment_deleted',
      `comment:${id}`,
    );
    return { id };
  }

  @Post('conversations/:id/link-customer')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Link the chat session to an existing customer' })
  async linkCustomer(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: LinkCustomerRequest,
  ) {
    const result = await this.agentService.linkCustomer(id, tenantOf(user), body.customer_id);
    await this.agentService.auditAgentAction(
      actorIdOf(user),
      tenantOf(user),
      'agent.customer_linked',
      `conversation:${id}`,
      { customerId: body.customer_id },
    );
    return result;
  }

  @Post('conversations/:id/create-customer')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Create a new customer from chat info and link it' })
  async createCustomer(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreateCustomerRequest,
  ) {
    const result = await this.agentService.createAndLinkCustomer(id, tenantOf(user), {
      name: body.name,
      email: body.email,
      phone: body.phone,
    });
    // No name/email/phone in the metadata — the audit log is not a PII store.
    await this.agentService.auditAgentAction(
      actorIdOf(user),
      tenantOf(user),
      'agent.customer_created',
      `conversation:${id}`,
    );
    return result;
  }

  @Post('conversations/:id/accept')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Accept / take over a conversation' })
  async accept(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const conversation = await this.agentService.accept(id, actorIdOf(user), tenantOf(user));
    await this.agentService.auditAgentAction(
      actorIdOf(user),
      tenantOf(user),
      'agent.conversation_accepted',
      `conversation:${id}`,
    );
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
    // Either-or: text, files, or both — never an empty reply (PLN-260814).
    if (!body.body?.trim() && !body.attachment_ids?.length) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
    const agentId = actorIdOf(user);
    const saved = await this.agentService.sendMessage(
      id,
      agentId,
      tenantOf(user),
      body.body,
      body.attachment_ids,
    );
    const attachments = await this.attachments.findByMessageIds([Number(saved.id)]);
    // Length and file count only — the message itself lives in the transcript,
    // which has a different retention life than the audit trail.
    await this.agentService.auditAgentAction(
      agentId,
      tenantOf(user),
      'agent.message_sent',
      `conversation:${id}`,
      {
        messageId: saved.id,
        length: saved.body.length,
        attachments: attachments.get(String(saved.id))?.length ?? 0,
      },
    );
    const senderName = await this.agentService.agentName(agentId);
    return toMessageResponse(saved, senderName, attachments.get(String(saved.id)));
  }

  @Post('conversations/:id/attachments')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024, files: 1 } }))
  @ApiOperation({ summary: 'Upload a file to send with an agent reply (PLN-260814 S4)' })
  async uploadAttachment(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file?: UploadInput,
  ) {
    if (!file) throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    const tenantId = tenantOf(user);
    const agentId = actorIdOf(user);
    // Ownership before storage: an agent may only attach to a conversation of
    // their own tenant, and this throws if it is not.
    await this.agentService.findConversation(id, tenantId);

    const saved = await this.attachments.store(file, {
      tenantId,
      conversationId: id,
      sessionId: null,
      uploaderType: 'agent',
      uploaderId: agentId,
      source: 'console',
    });
    await this.agentService.auditAgentAction(
      agentId,
      tenantId,
      'chat.attachment_uploaded',
      `attachment:${saved.uuid}`,
      { kind: saved.kind, mime: saved.mime, size: Number(saved.size), source: 'console' },
    );
    return AttachmentMapper.toResponse(saved);
  }

  @Post('conversations/:id/handback')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Hand the conversation back to the AI without ending it' })
  async handBack(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const conversation = await this.agentService.handBack(id, tenantOf(user), actorIdOf(user));
    return { id: conversation.id, status: conversation.status };
  }

  @Post('conversations/:id/end')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'End the conversation and release the assignment' })
  async end(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const conversation = await this.agentService.end(id, tenantOf(user));
    await this.agentService.auditAgentAction(
      actorIdOf(user),
      tenantOf(user),
      'agent.conversation_ended',
      `conversation:${id}`,
      { escalated: conversation.escalated === 1 },
    );
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
