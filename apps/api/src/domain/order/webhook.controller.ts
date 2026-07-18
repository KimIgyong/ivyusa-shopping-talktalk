import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderService } from './order.service';
import { FulfillmentWebhookRequest } from './dto/request/order.request';
import { Public } from '../../global/decorator/public.decorator';
import { verifyFulfillmentWebhookSecret } from '../../global/util/webhook-secret.util';

/** External webhook intake (FR-021). Public; authenticated by a shared-secret header. */
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
    verifyFulfillmentWebhookSecret(secret);
    return this.orderService.handleFulfillmentWebhook(
      Number(body.order_id),
      body.status,
      body.tracking_number,
      body.carrier,
    );
  }
}
