import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AI_FUNCTION, isSupportedLanguage } from '@ivy/types';
import { ConversationBriefing } from './entity/conversation-briefing.entity';
import { PROMPT_LANGUAGE_NAMES } from './prompt-language';
import { AgentService } from './agent.service';
import { AiGatewayService } from '../../infrastructure/external/ai/ai-gateway.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Messages the briefing summarises — the tail is what an agent needs oriented. */
const BRIEFING_WINDOW = 50;

/**
 * Operator-requested AI briefings (REQ-260824 R3). Generation happens only on
 * an explicit POST — opening a conversation reads the stored row and costs no
 * model call (the pre-260824 behaviour generated on every open). Failures are
 * surfaced as E5055, never swallowed into "no briefing".
 */
@Injectable()
export class BriefingService {
  private readonly logger = new Logger(BriefingService.name);

  constructor(
    @InjectRepository(ConversationBriefing)
    private readonly briefingRepo: Repository<ConversationBriefing>,
    private readonly agentService: AgentService,
    private readonly aiGateway: AiGatewayService,
  ) {}

  /** Latest stored briefing, or null when none was requested yet. No model call. */
  async latest(conversationId: number, tenantId: number): Promise<ConversationBriefing | null> {
    await this.agentService.findConversation(conversationId, tenantId);
    return this.briefingRepo.findOne({
      where: { conversationId, tenantId },
      order: { id: 'DESC' },
    });
  }

  async generate(
    conversationId: number,
    tenantId: number,
    requestedBy: number,
  ): Promise<ConversationBriefing> {
    const { messages } = await this.agentService.listMessages(conversationId, tenantId, {
      limit: BRIEFING_WINDOW,
    });
    if (!messages.length) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
    const transcript = messages.map((m) => `${m.senderType}: ${m.body}`).join('\n');
    let text: string;
    try {
      const res = await this.aiGateway.complete({
        tenantId,
        function: AI_FUNCTION.ASSIST,
        feature: 'agent_briefing',
        system:
          'Summarize the conversation: summary, intent, sentiment, recommended action. Reply concisely.',
        messages: [{ role: 'user', content: transcript }],
      });
      text = (res.text ?? '').trim();
    } catch (e) {
      this.logger.warn(`briefing generation failed: ${(e as Error).message}`);
      throw new BusinessException(ERROR_CODE.BRIEFING_FAILED, HttpStatus.BAD_GATEWAY);
    }
    if (!text) throw new BusinessException(ERROR_CODE.BRIEFING_FAILED, HttpStatus.BAD_GATEWAY);
    return this.briefingRepo.save(
      this.briefingRepo.create({
        tenantId,
        conversationId,
        lastMessageId: Number(messages[messages.length - 1].id),
        body: text,
        translations: null,
        requestedBy,
      }),
    );
  }

  /**
   * Translate a stored briefing into one system language. The stored copy wins
   * over a second model call — asking twice for Korean costs one translation.
   */
  async translate(id: number, tenantId: number, lang: string): Promise<ConversationBriefing> {
    const normalized = lang.toLowerCase();
    if (!isSupportedLanguage(normalized)) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
    const briefing = await this.briefingRepo.findOne({ where: { id, tenantId } });
    if (!briefing) {
      this.logger.warn(`briefing translate refused: id=${id} tenant=${tenantId}`);
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    if (briefing.translations?.[normalized]) return briefing;

    const target = PROMPT_LANGUAGE_NAMES[normalized] ?? normalized;
    let text: string;
    try {
      const res = await this.aiGateway.complete({
        tenantId,
        function: AI_FUNCTION.ASSIST,
        feature: 'agent_briefing',
        system: `Translate the following conversation briefing into ${target}. Keep the structure and be faithful — no additions, no commentary.`,
        messages: [{ role: 'user', content: briefing.body }],
      });
      text = (res.text ?? '').trim();
    } catch (e) {
      this.logger.warn(`briefing translation failed: ${(e as Error).message}`);
      throw new BusinessException(ERROR_CODE.BRIEFING_FAILED, HttpStatus.BAD_GATEWAY);
    }
    if (!text) throw new BusinessException(ERROR_CODE.BRIEFING_FAILED, HttpStatus.BAD_GATEWAY);
    briefing.translations = { ...(briefing.translations ?? {}), [normalized]: text };
    return this.briefingRepo.save(briefing);
  }
}
