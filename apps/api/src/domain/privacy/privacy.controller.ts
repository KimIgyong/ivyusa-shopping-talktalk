import { Body, Controller, Get, HttpStatus, Logger, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import * as crypto from 'crypto';
import type { Request } from 'express';
import { PrivacyService } from './privacy.service';
import {
  CustomersDataRequest,
  CustomersRedactRequest,
  DsarDeleteRequest,
  OptOutRequest,
  ShopRedactRequest,
} from './dto/privacy.dto';
import { Public } from '../../global/decorator/public.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/**
 * Shopify mandatory GDPR/compliance webhooks (audit High-2). Public; HMAC-verified.
 */
@ApiTags('Webhooks')
@Controller('webhooks/shopify')
export class ShopifyComplianceController {
  private readonly logger = new Logger(ShopifyComplianceController.name);

  constructor(private readonly privacyService: PrivacyService) {}

  /**
   * Verify the Shopify webhook HMAC (base64 of HMAC-SHA256 over the payload).
   * In dev (no secret) we log a warning and allow; otherwise mismatches are rejected.
   * NOTE: production should verify against the raw request body, not the re-stringified JSON.
   */
  private verifyShopifyHmac(payload: unknown, hmacHeader: string | undefined): void {
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
    if (!secret) {
      this.logger.warn('SHOPIFY_WEBHOOK_SECRET not set — allowing webhook unverified (dev only)');
      return;
    }
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const digest = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');
    const provided = hmacHeader ?? '';
    const a = Buffer.from(digest);
    const b = Buffer.from(provided);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.UNAUTHORIZED);
    }
  }

  private hmacOf(req: Request): string | undefined {
    return req.header('X-Shopify-Hmac-Sha256') ?? undefined;
  }

  @Post('customers/data_request')
  @Public()
  @ApiOperation({ summary: 'Shopify GDPR: request customer data (audit High-2)' })
  async customersDataRequest(@Body() body: CustomersDataRequest, @Req() req: Request) {
    this.verifyShopifyHmac(body, this.hmacOf(req));
    const email = body.customer?.email ?? null;
    await this.privacyService.handleCustomerDataRequest(email);
    return { received: true };
  }

  @Post('customers/redact')
  @Public()
  @ApiOperation({ summary: 'Shopify GDPR: redact customer (audit High-2)' })
  async customersRedact(@Body() body: CustomersRedactRequest, @Req() req: Request) {
    this.verifyShopifyHmac(body, this.hmacOf(req));
    const email = body.customer?.email ?? null;
    const shopifyId = body.customer?.id != null ? String(body.customer.id) : null;
    await this.privacyService.handleCustomerRedact(email, shopifyId);
    return { redacted: true };
  }

  @Post('shop/redact')
  @Public()
  @ApiOperation({ summary: 'Shopify GDPR: redact shop (audit High-2)' })
  async shopRedact(@Body() body: ShopRedactRequest, @Req() req: Request) {
    this.verifyShopifyHmac(body, this.hmacOf(req));
    await this.privacyService.handleShopRedact(body.shop_domain ?? null);
    return { received: true };
  }
}

/**
 * Widget-facing consumer-rights endpoints (audit High-3): DSAR access/erasure and
 * CCPA/CPRA "Do Not Sell or Share". Public; session-token identified + bound.
 */
@ApiTags('Privacy')
@Controller('privacy')
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

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
