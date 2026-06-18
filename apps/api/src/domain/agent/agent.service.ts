import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  AI_FUNCTION,
  CONVERSATION_STATUS,
  MODERATION_DECISION,
  SENDER_TYPE,
} from '@ivy/types';
import { Conversation } from '../chat/entity/conversation.entity';
import { Message } from '../chat/entity/message.entity';
import { AgentProfile } from './entity/agent-profile.entity';
import { Assignment } from './entity/assignment.entity';
import { AgentDailyStat } from './entity/agent-daily-stat.entity';
import { ModerationService } from '../moderation/moderation.service';
import { AiGatewayService } from '../../infrastructure/external/ai/ai-gateway.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { UpsertProfileRequest } from './agent.dto';

/**
 * Agent console orchestration (FR-066/067, FR-045). Manages the human-agent
 * session queue, conversation takeover, moderated agent replies, AI briefings,
 * agent profiles, and performance stats.
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    @InjectRepository(Conversation) private readonly convRepo: Repository<Conversation>,
    @InjectRepository(Message) private readonly msgRepo: Repository<Message>,
    @InjectRepository(AgentProfile) private readonly profileRepo: Repository<AgentProfile>,
    @InjectRepository(Assignment) private readonly assignmentRepo: Repository<Assignment>,
    @InjectRepository(AgentDailyStat) private readonly statRepo: Repository<AgentDailyStat>,
    private readonly moderation: ModerationService,
    private readonly aiGateway: AiGatewayService,
  ) {}

  /** Session queue: conversations awaiting/handled by an agent. */
  async listSessions(
    page: number,
    size: number,
  ): Promise<{ items: Array<{ conversation: Conversation; lastMessage: Message | null }>; total: number }> {
    const [conversations, total] = await this.convRepo.findAndCount({
      where: { status: In([CONVERSATION_STATUS.WAITING, CONVERSATION_STATUS.AGENT]) },
      order: { id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    const items = await Promise.all(
      conversations.map(async (conversation) => ({
        conversation,
        lastMessage: await this.msgRepo.findOne({
          where: { conversationId: conversation.id },
          order: { id: 'DESC' },
        }),
      })),
    );
    return { items, total };
  }

  async listMessages(conversationId: number): Promise<Message[]> {
    return this.msgRepo.find({ where: { conversationId }, order: { id: 'ASC' } });
  }

  /** AI briefing for an agent picking up a conversation (FR-045). */
  async briefing(tenantId: number, messages: Message[]): Promise<string> {
    if (messages.length === 0) return '';
    const transcript = messages.map((m) => `${m.senderType}: ${m.body}`).join('\n');
    try {
      const res = await this.aiGateway.complete({
        tenantId,
        function: AI_FUNCTION.ASSIST,
        system:
          'Summarize the conversation: summary, intent, sentiment, recommended action. Reply concisely.',
        messages: [{ role: 'user', content: transcript }],
      });
      return res.text ?? '';
    } catch (e) {
      this.logger.warn(`Briefing failed: ${(e as Error).message}`);
      return '';
    }
  }

  /** Agent accepts/takes over a conversation. */
  async accept(conversationId: number, agentId: number, tenantId: number): Promise<Conversation> {
    await this.assignmentRepo.save(
      this.assignmentRepo.create({
        tenantId,
        conversationId,
        agentId,
        assignedBy: agentId,
        type: 'manual',
        status: 'active',
      }),
    );
    await this.convRepo.update(
      { id: conversationId },
      { status: CONVERSATION_STATUS.AGENT, agentId },
    );
    return this.convRepo.findOneOrFail({ where: { id: conversationId } });
  }

  /** Send a moderated agent message (FR-069). */
  async sendMessage(
    conversationId: number,
    agentId: number,
    tenantId: number,
    body: string,
  ): Promise<Message> {
    const moderated = await this.moderation.moderate({
      tenantId,
      scope: 'agent',
      authorType: 'agent',
      authorId: agentId,
      conversationId,
      text: body,
    });
    if (moderated.decision === MODERATION_DECISION.BLOCKED) {
      throw new BusinessException(ERROR_CODE.MODERATION_BLOCKED, HttpStatus.UNPROCESSABLE_ENTITY);
    }
    return this.msgRepo.save(
      this.msgRepo.create({
        conversationId,
        senderType: SENDER_TYPE.AGENT,
        body: moderated.text,
        lang: null,
        retrievalTrace: null,
      }),
    );
  }

  /** End a conversation and release the active assignment. */
  async end(conversationId: number): Promise<Conversation> {
    await this.convRepo.update(
      { id: conversationId },
      { status: CONVERSATION_STATUS.ENDED, endedAt: new Date() },
    );
    await this.assignmentRepo.update(
      { conversationId, status: 'active' },
      { status: 'released', releasedAt: new Date() },
    );
    return this.convRepo.findOneOrFail({ where: { id: conversationId } });
  }

  async getProfile(userId: number): Promise<AgentProfile | null> {
    return this.profileRepo.findOne({ where: { userId } });
  }

  async upsertProfile(
    userId: number,
    tenantId: number,
    input: UpsertProfileRequest,
  ): Promise<AgentProfile> {
    const existing = await this.profileRepo.findOne({ where: { userId } });
    if (existing) {
      if (input.languages !== undefined) existing.languages = input.languages;
      if (input.skills !== undefined) existing.skills = input.skills;
      if (input.max_concurrent !== undefined) existing.maxConcurrent = input.max_concurrent;
      if (input.status !== undefined) existing.status = input.status;
      return this.profileRepo.save(existing);
    }
    return this.profileRepo.save(
      this.profileRepo.create({
        tenantId,
        userId,
        languages: input.languages ?? null,
        skills: input.skills ?? null,
        maxConcurrent: input.max_concurrent ?? 3,
        status: input.status ?? 'offline',
      }),
    );
  }

  async listStats(
    tenantId: number,
    page: number,
    size: number,
  ): Promise<{ items: AgentDailyStat[]; total: number }> {
    const [items, total] = await this.statRepo.findAndCount({
      where: { tenantId },
      order: { statDate: 'DESC', id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    return { items, total };
  }
}
