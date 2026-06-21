import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal } from '@ivy/types';
import { buildPagination, normalizePage } from '@ivy/common';
import { CjmEvent } from './entity/cjm-event.entity';
import { CjmService } from './cjm.service';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { Paginated } from '../../global/interceptor/transform.interceptor';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

function toResponse(e: CjmEvent) {
  return {
    id: e.id,
    sessionId: e.sessionId,
    customerId: e.customerId,
    stage: e.stage,
    eventType: e.eventType,
    payload: e.payload,
    createdAt: e.createdAt,
  };
}

/** Customer journey map analytics (FR-046). */
@ApiTags('CJM')
@Controller('cjm')
export class CjmController {
  constructor(private readonly cjmService: CjmService) {}

  @Get('events')
  @RequireCapability(CAPABILITY.ANALYTICS_READ)
  @ApiOperation({ summary: 'List customer journey events (filter by stage / customer)' })
  async list(
    @CurrentUser() user: Principal,
    @Query('stage') stage?: string,
    @Query('customer_id') customerId?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const { page: p, size: s } = normalizePage(page, size);
    const customerIdNum = customerId !== undefined ? Number(customerId) : undefined;
    const [items, total] = await this.cjmService.list(this.tenantId(user), stage, customerIdNum, p, s);
    return new Paginated(items.map(toResponse), buildPagination(p, s, total));
  }

  private tenantId(user: Principal): number {
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return user.tenantId;
  }
}
