import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../global/decorator/public.decorator';
import { Cafe24OAuthService } from './cafe24-oauth.service';
import { Cafe24CustomerAuthService } from './cafe24-customer-auth.service';

/**
 * Cafe24 OAuth callback (path B). Public — Cafe24 redirects the browser here with
 * `code` + `state`; the tenant binding is carried server-side in the Redis state.
 *
 * Cafe24 registers ONE redirect_uri per app, so this single callback serves BOTH
 * the admin install and the storefront member sign-in (P-A2). It dispatches by
 * state: a customer-auth state hands back a one-time ticket to the storefront,
 * everything else is an admin install that stores the tenant credential.
 */
@ApiTags('Auth')
@Controller('auth/cafe24')
export class Cafe24OAuthController {
  private static readonly BOUNCE_BACK =
    '<!doctype html><meta charset="utf-8"><title>Sign-in</title>' +
    '<script>try{history.length>1?history.back():location.replace("/")}catch(e){location.replace("/")}</script>';

  constructor(
    private readonly oauthService: Cafe24OAuthService,
    private readonly customerAuthService: Cafe24CustomerAuthService,
  ) {}

  @Get('callback')
  @Public()
  @ApiOperation({ summary: 'Cafe24 OAuth callback — admin install or member sign-in (by state)' })
  async callback(@Query() query: Record<string, string>, @Res() res: Response): Promise<void> {
    // Storefront member sign-in (P-A2): bind a session, bounce back with a ticket.
    if (await this.customerAuthService.isCustomerAuthState(query.state ?? '')) {
      try {
        const { returnUrl, ticket } = await this.customerAuthService.handleCallback(query);
        const sep = returnUrl.includes('#') ? '&' : '#';
        res.redirect(`${returnUrl}${sep}ivy_ticket=${encodeURIComponent(ticket)}`);
      } catch {
        res.status(200).type('html').send(Cafe24OAuthController.BOUNCE_BACK);
      }
      return;
    }
    // Admin install: exchange the code and store the tenant's Cafe24 credential.
    const base = this.oauthService.consoleReturnUrl;
    try {
      const { mallId } = await this.oauthService.handleCallback(query);
      res.redirect(`${base}/?cafe24_connected=${encodeURIComponent(mallId)}`);
    } catch {
      res.redirect(`${base}/?cafe24_error=1`);
    }
  }
}
