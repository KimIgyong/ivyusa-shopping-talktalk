import { Body, Controller, Post, RawBodyRequest, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ShopifyWebhookService } from './shopify-webhook.service';
import { ShopifyFulfillmentDto, ShopifyOrderDto } from './shopify-admin.client';
import { Public } from '../../global/decorator/public.decorator';
import { verifyShopifyHmac } from '../../global/util/shopify-hmac.util';

/**
 * Shopify-native order/fulfillment webhooks (operational). Public; HMAC-verified.
 * Shares the `/webhooks/shopify` prefix with the GDPR compliance controller.
 */
@ApiTags('Webhooks')
@Controller('webhooks/shopify')
export class ShopifyOrderWebhookController {
  constructor(private readonly webhookService: ShopifyWebhookService) {}

  @Post('orders/create')
  @Public()
  @ApiOperation({ summary: 'Shopify webhook: order created → cache' })
  async ordersCreate(@Body() body: ShopifyOrderDto, @Req() req: RawBodyRequest<Request>) {
    verifyShopifyHmac(req.rawBody, body, req.header('X-Shopify-Hmac-Sha256'));
    await this.webhookService.handleOrderUpsert(req.header('X-Shopify-Shop-Domain'), body);
    return { received: true };
  }

  @Post('orders/updated')
  @Public()
  @ApiOperation({ summary: 'Shopify webhook: order updated → cache' })
  async ordersUpdated(@Body() body: ShopifyOrderDto, @Req() req: RawBodyRequest<Request>) {
    verifyShopifyHmac(req.rawBody, body, req.header('X-Shopify-Hmac-Sha256'));
    await this.webhookService.handleOrderUpsert(req.header('X-Shopify-Shop-Domain'), body);
    return { received: true };
  }

  @Post('fulfillments/create')
  @Public()
  @ApiOperation({ summary: 'Shopify webhook: fulfillment created → order status' })
  async fulfillmentsCreate(@Body() body: ShopifyFulfillmentDto, @Req() req: RawBodyRequest<Request>) {
    verifyShopifyHmac(req.rawBody, body, req.header('X-Shopify-Hmac-Sha256'));
    await this.webhookService.handleFulfillment(req.header('X-Shopify-Shop-Domain'), body);
    return { received: true };
  }

  @Post('fulfillments/update')
  @Public()
  @ApiOperation({ summary: 'Shopify webhook: fulfillment updated → order status' })
  async fulfillmentsUpdate(@Body() body: ShopifyFulfillmentDto, @Req() req: RawBodyRequest<Request>) {
    verifyShopifyHmac(req.rawBody, body, req.header('X-Shopify-Hmac-Sha256'));
    await this.webhookService.handleFulfillment(req.header('X-Shopify-Shop-Domain'), body);
    return { received: true };
  }
}
