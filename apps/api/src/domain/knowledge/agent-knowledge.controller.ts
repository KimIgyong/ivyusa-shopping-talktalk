import { Body, Controller, HttpStatus, Logger, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal } from '@ivy/types';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { KnowledgeService } from './knowledge.service';
import { AskKnowledgeRequest, ProposeAnswerRequest } from './dto/request/knowledge.request';
import { AnswerProposalService } from './answer-proposal.service';

/**
 * Read-only knowledge lookup for the people handling chats (PLN-260810 S2).
 *
 * The console's own `/knowledge/ask` is gated on `knowledge_source.manage`,
 * which master and director hold — not the managers and staff who actually
 * answer customers. Granting them that capability to let them *read* would also
 * hand them document creation and deletion, so this is a separate surface with
 * the capability they already have and nothing else on it: no create, no edit,
 * no delete.
 *
 * Nothing is recorded against the conversation. An agent checking what the
 * knowledge base says is not a customer turn, and letting it into the message
 * history, the statistics or the CJM would corrupt all three.
 *
 * Proposing is on this surface too, and it still writes no knowledge: a
 * proposal is inert until an owner approves it (PLN-260810 D3).
 */
@ApiTags('Knowledge')
@Controller('agent/knowledge')
export class AgentKnowledgeController {
  private readonly logger = new Logger(AgentKnowledgeController.name);

  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly proposals: AnswerProposalService,
  ) {}

  @Post('ask')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  // Every call is an LLM round trip. The global limit (600/min) is sized for
  // widget polling and would not notice a stuck retry loop here.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Ask the knowledge base (read-only, for chat handlers)' })
  async ask(@CurrentUser() user: Principal, @Body() body: AskKnowledgeRequest) {
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    const question = body.question?.trim() ?? '';
    if (!question) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
    this.logger.log(`agent knowledge lookup by user ${user.userId}`);
    return this.knowledgeService.ask(
      user.tenantId,
      question,
      body.language ?? 'EN',
      body.group,
      body.ai_agent_id ?? null,
    );
  }

  @Post('proposals')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Propose an answer for the knowledge base (awaits approval)' })
  async propose(@CurrentUser() user: Principal, @Body() body: ProposeAnswerRequest) {
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return this.proposals.propose(
      user.tenantId,
      {
        conversationId: body.conversation_id ?? null,
        question: body.question,
        answer: body.answer,
      },
      user.userId,
    );
  }
}
