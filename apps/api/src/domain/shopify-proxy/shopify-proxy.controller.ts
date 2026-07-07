import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../global/decorator/public.decorator';
import { ShopifyProxyService } from './shopify-proxy.service';

/**
 * Shopify App Proxy endpoints. Reached as `https://<shop>/apps/<subpath>/*` and
 * forwarded here by Shopify with a `signature`. Responses go straight to the
 * storefront browser (same-origin as the shop), so we send plain JSON and skip
 * the API envelope via @Res.
 */
@ApiTags('shopify-proxy')
@Controller('shopify/proxy')
export class ShopifyProxyController {
  constructor(private readonly proxyService: ShopifyProxyService) {}

  @Public()
  @Get('identity')
  @ApiOperation({ summary: 'Resolve the logged-in storefront customer → session token' })
  async identity(
    @Query() query: Record<string, unknown>,
    @Res() res: Response,
  ): Promise<void> {
    const outcome = await this.proxyService.resolveIdentity(query);
    res.setHeader('Cache-Control', 'no-store');
    if (outcome.status === 'bad_signature') {
      res.status(401).json({ authenticated: false });
      return;
    }
    res.status(200).json(outcome.result);
  }
}
