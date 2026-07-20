import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal } from '@ivy/types';
import { buildPagination, normalizePage } from '@ivy/common';
import { SubscriptionService } from './subscription.service';
import { Subscription } from './entity/subscription.entity';
import { Public } from '../../global/decorator/public.decorator';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { Paginated } from '../../global/interceptor/transform.interceptor';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { CancelRequest } from './dto/request/subscription.request';
import { SessionToken } from '../../global/decorator/session-token.decorator';

/** Customer subscriptions (FR-043) — widget views + tenant admin list. */
function toResponse(s: Subscription) {
  return { id: s.id, plan: s.plan, status: s.status, nextBilling: s.nextBilling };
}

@ApiTags('Subscription')
@Controller()
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('subscriptions')
  @Public()
  @ApiOperation({ summary: "List the customer's subscriptions (requires auth)" })
  async list(@SessionToken() token: string) {
    const subs = await this.subscriptionService.listForSession(token);
    return subs.map(toResponse);
  }

  @Post('subscriptions/:id/cancel')
  @Public()
  @ApiOperation({ summary: 'Cancel a subscription (verifies ownership)' })
  async cancel(@Param('id', ParseIntPipe) id: number, @Body() body: CancelRequest) {
    const sub = await this.subscriptionService.cancel(body.session_token, id);
    return toResponse(sub);
  }

  @Get('admin/subscriptions')
  @RequireCapability(CAPABILITY.MODULE_OPERATIONS)
  @ApiOperation({ summary: 'List subscriptions (tenant admin)' })
  async adminList(
    @CurrentUser() user: Principal,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const { page: p, size: s } = normalizePage(page, size);
    const [items, total] = await this.subscriptionService.listAll(this.tenantId(user), p, s);
    return new Paginated(items.map(toResponse), buildPagination(p, s, total));
  }

  private tenantId(user: Principal): number {
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return user.tenantId;
  }
}
