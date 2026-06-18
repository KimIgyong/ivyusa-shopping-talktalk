import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { CAPABILITY, Principal } from '@ivy/types';
import { buildPagination, normalizePage } from '@ivy/common';
import { SubscriptionService } from './subscription.service';
import { Subscription } from './entity/subscription.entity';
import { Public } from '../../global/decorator/public.decorator';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { Paginated } from '../../global/interceptor/transform.interceptor';

class CancelRequest {
  @IsString() session_token: string;
}

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
  async list(@Query('session_token') token: string) {
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
    @CurrentUser() _user: Principal,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const { page: p, size: s } = normalizePage(page, size);
    const [items, total] = await this.subscriptionService.listAll(p, s);
    return new Paginated(items.map(toResponse), buildPagination(p, s, total));
  }
}
