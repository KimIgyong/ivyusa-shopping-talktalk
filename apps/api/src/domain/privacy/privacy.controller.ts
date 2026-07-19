import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PrivacyService } from './privacy.service';
import {
  CustomersDataRequest,
  CustomersRedactRequest,
  DsarDeleteRequest,
  OptOutRequest,
  ShopRedactRequest,
} from './dto/request/privacy.request';
import { Public } from '../../global/decorator/public.decorator';
import { AdminOnly } from '../../global/decorator/auth.decorator';
import { verifyShopifyHmac } from '../../global/util/shopify-hmac.util';
import { RetentionService } from './retention.service';

/**
 * Shopify mandatory GDPR/compliance webhooks (audit High-2). Public; HMAC-verified.
 */
@ApiTags('Webhooks')
@Controller('webhooks/shopify')
export class ShopifyComplianceController {
  constructor(private readonly privacyService: PrivacyService) {}

  @Post('customers/data_request')
  @Public()
  @ApiOperation({ summary: 'Shopify GDPR: request customer data (audit High-2)' })
  async customersDataRequest(@Body() body: CustomersDataRequest, @Req() req: RawBodyRequest<Request>) {
    verifyShopifyHmac(req.rawBody, body, req.header('X-Shopify-Hmac-Sha256'));
    const email = body.customer?.email ?? null;
    await this.privacyService.handleCustomerDataRequest(email);
    return { received: true };
  }

  @Post('customers/redact')
  @Public()
  @ApiOperation({ summary: 'Shopify GDPR: redact customer (audit High-2)' })
  async customersRedact(@Body() body: CustomersRedactRequest, @Req() req: RawBodyRequest<Request>) {
    verifyShopifyHmac(req.rawBody, body, req.header('X-Shopify-Hmac-Sha256'));
    const email = body.customer?.email ?? null;
    const shopifyId = body.customer?.id != null ? String(body.customer.id) : null;
    await this.privacyService.handleCustomerRedact(email, shopifyId);
    return { redacted: true };
  }

  @Post('shop/redact')
  @Public()
  @ApiOperation({ summary: 'Shopify GDPR: redact shop — full tenant purge (audit High-2)' })
  async shopRedact(@Body() body: ShopRedactRequest, @Req() req: RawBodyRequest<Request>) {
    verifyShopifyHmac(req.rawBody, body, req.header('X-Shopify-Hmac-Sha256'));
    return this.privacyService.handleShopRedact(body.shop_domain ?? null);
  }
}

/**
 * Widget-facing consumer-rights endpoints (audit High-3): DSAR access/erasure and
 * CCPA/CPRA "Do Not Sell or Share". Public; session-token identified + bound.
 */
@ApiTags('Privacy')
@Controller('privacy')
export class PrivacyController {
  constructor(
    private readonly privacyService: PrivacyService,
    private readonly retentionService: RetentionService,
  ) {}

  // Runs on a scheduler too (RETENTION_PURGE_INTERVAL_HOURS) — this manual
  // endpoint lets an admin trigger/verify disposal on demand (POL-003).
  @Post('retention/purge')
  @AdminOnly()
  @ApiOperation({ summary: 'Retention/disposal: purge expired conversation logs (POL-003)' })
  async retentionPurge() {
    return this.retentionService.purgeExpired();
  }

  @Get('export')
  @Public()
  @ApiOperation({ summary: 'DSAR access/portability: export customer data (audit High-3)' })
  async export(@Query('session_token') sessionToken: string) {
    return this.privacyService.exportData(sessionToken);
  }

  @Post('delete')
  @Public()
  @ApiOperation({ summary: 'DSAR erasure: anonymize the customer (audit High-3)' })
  async delete(@Body() body: DsarDeleteRequest) {
    await this.privacyService.deleteData(body.session_token, body.confirm);
    return { deleted: true };
  }

  @Post('opt-out')
  @Public()
  @ApiOperation({ summary: 'CCPA/CPRA: Do Not Sell or Share toggle (audit High-3)' })
  async optOut(@Body() body: OptOutRequest) {
    await this.privacyService.setOptOut(body.session_token, body.opt_out);
    return { optOut: body.opt_out };
  }

  @Get('opt-out/status')
  @Public()
  @ApiOperation({ summary: 'CCPA/CPRA: current opt-out status' })
  async optOutStatus(@Query('session_token') sessionToken: string) {
    const optOut = await this.privacyService.getOptOutStatus(sessionToken);
    return { optOut };
  }
}
