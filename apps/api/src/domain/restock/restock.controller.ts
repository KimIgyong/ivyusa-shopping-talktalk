import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CAPABILITY, Principal } from '@ivy/types';
import { buildPagination, normalizePage } from '@ivy/common';
import { RestockService } from './restock.service';
import { Public } from '../../global/decorator/public.decorator';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { Paginated } from '../../global/interceptor/transform.interceptor';

class SubscribeRequest {
  @IsOptional() @IsString() session_token?: string;
  @IsString() product_id: string;
  @IsOptional() @IsString() channel?: string;
}

/** Back-in-stock notifications (FR-042) — widget subscribe + tenant admin list. */
@ApiTags('Restock')
@Controller()
export class RestockController {
  constructor(private readonly restockService: RestockService) {}

  @Post('restock/subscribe')
  @Public()
  @ApiOperation({ summary: 'Subscribe to back-in-stock notification (guests allowed)' })
  async subscribe(@Body() body: SubscribeRequest) {
    const sub = await this.restockService.subscribe(body.session_token, body.product_id, body.channel);
    return { id: sub.id, productId: sub.productId, channel: sub.channel, createdAt: sub.createdAt };
  }

  @Get('restock')
  @Public()
  @ApiOperation({ summary: "List the customer's restock subscriptions (requires auth)" })
  async list(@Query('session_token') token: string) {
    const subs = await this.restockService.listForSession(token);
    return subs.map((s) => ({
      id: s.id,
      productId: s.productId,
      channel: s.channel,
      createdAt: s.createdAt,
      notifiedAt: s.notifiedAt,
    }));
  }

  @Get('admin/restock')
  @RequireCapability(CAPABILITY.MODULE_OPERATIONS)
  @ApiOperation({ summary: 'List restock subscriptions (tenant admin)' })
  async adminList(
    @CurrentUser() _user: Principal,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const { page: p, size: s } = normalizePage(page, size);
    const [items, total] = await this.restockService.listAll(p, s);
    return new Paginated(items, buildPagination(p, s, total));
  }
}
