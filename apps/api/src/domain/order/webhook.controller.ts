import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderService } from './order.service';
import { FulfillmentWebhookRequest } from './dto/order.dto';
import { Public } from '../../global/decorator/public.decorator';

/** External webhook intake (FR-021). Public; verified out-of-band by signature/middleware. */
@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly orderService: OrderService) {}

  @Post('fulfillment')
  @Public()
  @ApiOperation({ summary: 'Fulfillment update webhook (FR-021)' })
  async fulfillment(@Body() body: FulfillmentWebhookRequest) {
    return this.orderService.handleFulfillmentWebhook(
      Number(body.order_id),
      body.status,
      body.tracking_number,
      body.carrier,
    );
  }
}
