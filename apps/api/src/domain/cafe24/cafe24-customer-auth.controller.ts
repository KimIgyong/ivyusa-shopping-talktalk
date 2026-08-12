import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../global/decorator/public.decorator';
import {
  Cafe24CustomerAuthService,
  cafe24TicketDelivery,
} from './cafe24-customer-auth.service';

/**
 * Cafe24 storefront member sign-in (PLN-260808 P-A2). All @Public — the storefront
 * (top window OR a widget-opened popup) drives start/callback; the widget iframe only
 * calls `exchange`. On any failure the shopper is bounced back and stays anonymous.
 * Note: because Cafe24 registers one redirect_uri per app, the live callback arrives
 * at /auth/cafe24/callback (Cafe24OAuthController); this callback stays for the case
 * a second redirect_uri is ever registered.
 */
@ApiTags('cafe24-customer-auth')
@Controller('public/cafe24/customer-auth')
export class Cafe24CustomerAuthController {
  constructor(private readonly service: Cafe24CustomerAuthService) {}

  @Get('start')
  @Public()
  @ApiOperation({ summary: 'Begin Cafe24 customer authentication (redirects to the mall authorize)' })
  async start(
    @Query('shop') shop: string,
    @Query('return') returnUrl: string,
    @Query('mode') mode: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const authorizeUrl = await this.service.start(shop ?? '', returnUrl ?? '', mode === 'popup');
      res.redirect(authorizeUrl);
    } catch {
      res.status(200).type('html').send(cafe24TicketDelivery.bounceBack());
    }
  }

  @Get('callback')
  @Public()
  @ApiOperation({ summary: 'Cafe24 customer-auth callback — bind session, hand back a one-time ticket' })
  async callback(@Query() query: Record<string, string>, @Res() res: Response): Promise<void> {
    try {
      const out = await this.service.handleCallback(query);
      cafe24TicketDelivery.deliver(res, out);
    } catch {
      res.status(200).type('html').send(cafe24TicketDelivery.bounceBack());
    }
  }

  @Post('exchange')
  @Public()
  @ApiOperation({ summary: 'Redeem a one-time ticket for the widget session token' })
  async exchange(@Body('ticket') ticket: string): Promise<{ sessionToken: string }> {
    return this.service.exchangeTicket(ticket ?? '');
  }
}
