import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { Public } from '../../global/decorator/public.decorator';

/**
 * Shopify public-app OAuth endpoints (path B). Public — the store admin drives
 * these in the browser. Both use @Res() redirects (outside the response envelope).
 */
@ApiTags('Auth')
@Controller('auth/shopify')
export class ShopifyOAuthController {
  constructor(private readonly oauthService: ShopifyOAuthService) {}

  @Get('install')
  @Public()
  @ApiOperation({ summary: 'Begin Shopify OAuth — redirect to the authorize screen' })
  async install(@Query('shop') shop: string, @Res() res: Response): Promise<void> {
    const url = await this.oauthService.buildInstallUrl(shop ?? '');
    res.redirect(url);
  }

  @Get('callback')
  @Public()
  @ApiOperation({ summary: 'Shopify OAuth callback — exchange code, store credential' })
  async callback(@Query() query: Record<string, string>, @Res() res: Response): Promise<void> {
    const { shop } = await this.oauthService.handleCallback(query);
    res.redirect(`${this.oauthService.appUrl}/?shopify_connected=${encodeURIComponent(shop)}`);
  }
}
