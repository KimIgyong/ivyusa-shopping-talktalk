import { Body, Controller, Delete, Get, HttpStatus, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal } from '@ivy/types';
import { buildPagination, normalizePage } from '@ivy/common';
import { AnswerReuseService } from './answer-reuse.service';
import { AnswerReuseMapper } from './answer-reuse.mapper';
import { UpdateAnswerReuseRequest } from './dto/request/answer-reuse.request';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { Paginated } from '../../global/interceptor/transform.interceptor';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/**
 * Console management of the answer-reuse store (PLN-260808 Track C, D-C3).
 *
 * Gated on AI_SETTINGS_MANAGE: this is edited from /ai-setting by the tenant's
 * own admins. It required AI_ENGINE_MANAGE — a platform-admin capability no
 * tenant rank holds — so every endpoint here answered 403 to exactly the people
 * the screen was built for, and the console rendered "0 entries" instead of an
 * error. The section looked empty rather than broken.
 */
@ApiTags('AnswerReuse')
@Controller('admin/answer-reuse')
export class AnswerReuseController {
  constructor(private readonly service: AnswerReuseService) {}

  @Get()
  @RequireCapability(CAPABILITY.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'List reusable answers (paginated; q / active filters)' })
  async list(
    @CurrentUser() user: Principal,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('q') q?: string,
    @Query('active') active?: string,
  ) {
    const { page: p, size: s } = normalizePage(page, size);
    const { items, total } = await this.service.list(
      this.tenantId(user),
      p,
      s,
      q,
      active === '1' || active === 'true',
    );
    return new Paginated(items.map((r) => AnswerReuseMapper.toItem(r)), buildPagination(p, s, total));
  }

  @Patch(':id')
  @RequireCapability(CAPABILITY.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Edit an answer / toggle active (D-C3)' })
  async update(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateAnswerReuseRequest,
  ) {
    const row = await this.service.update(this.tenantId(user), id, {
      answerText: body.answer_text,
      active: body.active,
    });
    return AnswerReuseMapper.toItem(row);
  }

  @Delete(':id')
  @RequireCapability(CAPABILITY.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Delete a reusable answer (row + vector point)' })
  async remove(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    await this.service.remove(this.tenantId(user), id);
    return { deleted: true };
  }

  @Post('deactivate-all')
  @RequireCapability(CAPABILITY.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Deactivate every entry (e.g. after a KB overhaul)' })
  async deactivateAll(@CurrentUser() user: Principal) {
    const affected = await this.service.deactivateAll(this.tenantId(user));
    return { deactivated: affected };
  }

  /**
   * Re-embed every stored question. Run after an embedding change — the
   * FIX-260813 input_type correction left older rows with vectors a lookup can
   * never match, and nothing else rewrites them.
   */
  @Post('reindex')
  @RequireCapability(CAPABILITY.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Re-embed and re-index every stored question' })
  async reindex(@CurrentUser() user: Principal) {
    return this.service.reindex(this.tenantId(user));
  }

  private tenantId(user: Principal): number {
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return user.tenantId;
  }
}
