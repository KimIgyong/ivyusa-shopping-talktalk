import { Body, Controller, HttpStatus, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal } from '@ivy/types';
import { RequireCapability, RequireMenu } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { BoardReviewService } from './board-review.service';
import { PromoteBoardDocumentRequest, SimulateBoardDocumentRequest } from './dto/request/knowledge.request';

/**
 * Board review: adoption + simulation (PLN-260829 B2). Same /board path as the
 * B1 controller but a different module — writing kb_documents and running
 * retrieval are knowledge-side powers, gated by KNOWLEDGE_SOURCE_MANAGE
 * (P4-8) while plain board authoring stays open to the knowledge menu.
 */
@ApiTags('Board')
@Controller('board')
@RequireMenu('knowledge')
export class BoardReviewController {
  constructor(private readonly review: BoardReviewService) {}

  private actor(user: Principal): { tenantId: number; userId: number } {
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return { tenantId: user.tenantId, userId: Number(user.userId) };
  }

  @Post('documents/:id/promote')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Adopt a published board document into KB (upsert on BRD-{id})' })
  async promote(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: PromoteBoardDocumentRequest,
  ) {
    const a = this.actor(user);
    return this.review.promote(a.tenantId, id, { category: body.category }, a.userId);
  }

  @Post('documents/:id/reject')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Reviewed and deliberately not adopted' })
  async reject(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const a = this.actor(user);
    await this.review.reject(a.tenantId, id, a.userId);
    return { rejected: true };
  }

  @Post('documents/:id/reopen')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Back to published (the KB row of a promoted doc survives)' })
  async reopen(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const a = this.actor(user);
    await this.review.reopen(a.tenantId, id, a.userId);
    return { reopened: true };
  }

  @Post('documents/:id/simulate')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Preview the agent answer with this document injected as a candidate' })
  async simulate(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SimulateBoardDocumentRequest,
  ) {
    const a = this.actor(user);
    return this.review.simulate(
      a.tenantId,
      id,
      body.question,
      body.language ?? 'KO',
      body.ai_agent_id ?? null,
    );
  }

  @Post('documents/:id/simulate/golden')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Golden A/B: every active golden question without vs with the candidate' })
  async simulateGolden(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    return this.review.simulateGolden(this.actor(user).tenantId, id);
  }
}
