import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../global/decorator/public.decorator';
import { Cafe24CustomerAuthService } from './cafe24-customer-auth.service';

/**
 * Cafe24 storefront member sign-in (PLN-260808 P-A2). All @Public — the storefront
 * (top window) drives start/callback in the browser; the widget iframe only calls
 * `exchange`. On any failure the shopper is bounced back to the storefront (never
 * left on an API page) and simply stays anonymous.
 */
@ApiTags('cafe24-customer-auth')
@Controller('public/cafe24/customer-auth')
export class Cafe24CustomerAuthController {
  constructor(private readonly service: Cafe24CustomerAuthService) {}

  // Return the shopper to where they came from without trusting a redirect target.
  private static readonly BOUNCE_BACK =
    '<!doctype html><meta charset="utf-8"><title>Sign-in</title>' +
    '<script>try{history.length>1?history.back():location.replace("/")}catch(e){location.replace("/")}</script>';

  @Get('start')
  @Public()
  @ApiOperation({ summary: 'Begin Cafe24 customer authentication (redirects to the mall authorize)' })
  async start(
    @Query('shop') shop: string,
    @Query('return') returnUrl: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const authorizeUrl = await this.service.start(shop ?? '', returnUrl ?? '');
      res.redirect(authorizeUrl);
    } catch {
      res.status(200).type('html').send(Cafe24CustomerAuthController.BOUNCE_BACK);
    }
  }

  @Get('callback')
  @Public()
  @ApiOperation({ summary: 'Cafe24 customer-auth callback — bind session, hand back a one-time ticket' })
  async callback(@Query() query: Record<string, string>, @Res() res: Response): Promise<void> {
    try {
      const { returnUrl, ticket } = await this.service.handleCallback(query);
      const sep = returnUrl.includes('#') ? '&' : '#';
      res.redirect(`${returnUrl}${sep}ivy_ticket=${encodeURIComponent(ticket)}`);
    } catch {
      res.status(200).type('html').send(Cafe24CustomerAuthController.BOUNCE_BACK);
    }
  }

  @Post('exchange')
  @Public()
  @ApiOperation({ summary: 'Redeem a one-time ticket for the widget session token' })
  async exchange(@Body('ticket') ticket: string): Promise<{ sessionToken: string }> {
    return this.service.exchangeTicket(ticket ?? '');
  }
}
