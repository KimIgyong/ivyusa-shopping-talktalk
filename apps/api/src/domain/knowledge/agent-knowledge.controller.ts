import { Body, Controller, HttpStatus, Logger, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal } from '@ivy/types';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { KnowledgeService } from './knowledge.service';
import { AskKnowledgeRequest } from './dto/request/knowledge.request';

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
 */
@ApiTags('Knowledge')
@Controller('agent/knowledge')
export class AgentKnowledgeController {
  private readonly logger = new Logger(AgentKnowledgeController.name);

  constructor(private readonly knowledgeService: KnowledgeService) {}

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
    return this.knowledgeService.ask(user.tenantId, question, body.language ?? 'EN', body.group);
  }
}
