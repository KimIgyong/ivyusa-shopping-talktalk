import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../global/decorator/public.decorator';
import { Cafe24OAuthService } from './cafe24-oauth.service';

/**
 * Cafe24 OAuth callback (path B). Public — Cafe24 redirects the browser here with
 * `code` + `state`; the tenant binding is carried server-side in the Redis state.
 */
@ApiTags('Auth')
@Controller('auth/cafe24')
export class Cafe24OAuthController {
  constructor(private readonly oauthService: Cafe24OAuthService) {}

  @Get('callback')
  @Public()
  @ApiOperation({ summary: 'Cafe24 OAuth callback — exchange code, store credential' })
  async callback(@Query() query: Record<string, string>, @Res() res: Response): Promise<void> {
    const base = this.oauthService.consoleReturnUrl;
    try {
      const { mallId } = await this.oauthService.handleCallback(query);
      res.redirect(`${base}/?cafe24_connected=${encodeURIComponent(mallId)}`);
    } catch {
      res.redirect(`${base}/?cafe24_error=1`);
    }
  }
}
