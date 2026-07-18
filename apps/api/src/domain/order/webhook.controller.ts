import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderService } from './order.service';
import { FulfillmentWebhookRequest } from './dto/request/order.request';
import { Public } from '../../global/decorator/public.decorator';

/**
 * External webhook intake (FR-021). Public; authenticated by an `X-Webhook-Secret`
 * header. The secret is resolved per-tenant (from the order's tenant) with a global
 * env fallback and verified inside the service — see OrderService.
 */
@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly orderService: OrderService) {}

  @Post('fulfillment')
  @Public()
  @ApiOperation({ summary: 'Fulfillment update webhook (FR-021)' })
  async fulfillment(
    @Headers('x-webhook-secret') secret: string | undefined,
    @Body() body: FulfillmentWebhookRequest,
  ) {
    return this.orderService.handleFulfillmentWebhook(
      Number(body.order_id),
      body.status,
      body.tracking_number,
      body.carrier,
      secret,
    );
  }
}
