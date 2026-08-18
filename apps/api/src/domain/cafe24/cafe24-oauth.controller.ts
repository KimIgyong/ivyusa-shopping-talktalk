import { Controller, Get, Logger, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../global/decorator/public.decorator';
import { Cafe24OAuthService } from './cafe24-oauth.service';
import {
  Cafe24CustomerAuthService,
  cafe24TicketDelivery,
} from './cafe24-customer-auth.service';
import { logSafe } from './cafe24-mall';

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
  private readonly logger = new Logger(Cafe24OAuthController.name);

  constructor(
    private readonly oauthService: Cafe24OAuthService,
    private readonly customerAuthService: Cafe24CustomerAuthService,
  ) {}

  @Get('callback')
  @Public()
  @ApiOperation({ summary: 'Cafe24 OAuth callback — admin install or member sign-in (by state)' })
  async callback(@Query() query: Record<string, string>, @Res() res: Response): Promise<void> {
    // Storefront member sign-in (P-A2): bind a session, hand back a ticket — via
    // #fragment (top-window flow) or postMessage to the opener (in-widget popup).
    if (await this.customerAuthService.isCustomerAuthState(query.state ?? '')) {
      try {
        cafe24TicketDelivery.deliver(res, await this.customerAuthService.handleCallback(query));
      } catch (e) {
        // A 200 bounce-back is indistinguishable from success in the access log
        // unless the reason is written down (REQ-260819).
        // Same sanitizer as the other callback — the reason is attacker-shaped
        // input until proven otherwise.
        this.logger.warn(`Cafe24 member sign-in callback failed: ${logSafe(e)}`);
        res.status(200).type('html').send(cafe24TicketDelivery.bounceBack());
      }
      return;
    }
    // Admin install: exchange the code and store the tenant's Cafe24 credential.
    const base = this.oauthService.consoleReturnUrl;
    try {
      const { mallId } = await this.oauthService.handleCallback(query);
      res.redirect(`${base}/?cafe24_connected=${encodeURIComponent(mallId)}`);
    } catch {
      // Carry Cafe24's own reason to the console. `cafe24_error=1` told the
      // operator only that "something failed", which for an `invalid_scope`
      // refusal points at the wrong place entirely — the fix is in the app's
      // registered permissions, not in ShopTalk.
      const reason = /^[a-z_]{1,40}$/.test(query.error ?? '') ? query.error : '1';
      res.redirect(`${base}/?cafe24_error=${reason}`);
    }
  }
}
