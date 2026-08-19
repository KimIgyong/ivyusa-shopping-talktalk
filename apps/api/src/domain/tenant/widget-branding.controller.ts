import { Controller, Get, HttpStatus, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { TenantService } from './tenant.service';
import { WidgetLogoService } from './widget-logo.service';
import { Public } from '../../global/decorator/public.decorator';

/**
 * Public brand assets for the widget (PLN-260819 S4 FR-T1).
 *
 * Separate from the tenant console controller because everything here is
 * unauthenticated and cached hard, while everything there is neither.
 */
@ApiTags('Widget')
@Controller('public/widget')
export class WidgetBrandingController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly widgetLogo: WidgetLogoService,
  ) {}

  /**
   * No auth and no signature, deliberately: the widget paints this before anyone
   * is identified, and a signed URL would defeat the cache and expire mid-visit.
   * A logo is not private data. `v` is only a cache buster — a new upload gets a
   * new id, so the URL changes whenever the file does.
   */
  @Get('logo')
  @Public()
  @SkipThrottle() // one request per storefront page load, same as the widget itself
  @ApiOperation({ summary: "A storefront's widget logo (public, immutable cache)" })
  async logo(@Query('shop') shop: string, @Res() res: Response): Promise<void> {
    const tenant = shop ? await this.tenantService.findByShopDomain(shop) : null;
    const logo = tenant?.widgetTheme?.logo ?? null;
    if (!tenant || !logo) {
      res.status(HttpStatus.NOT_FOUND).end();
      return;
    }

    res.setHeader('Content-Type', logo.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    const stream = this.widgetLogo.openStream(Number(tenant.id), logo);
    stream.on('error', () => {
      // The theme says there is a logo but the file is gone (volume reset, manual
      // delete). Answer 404 rather than a half-written body; the widget falls
      // back to its text header on its own.
      if (!res.headersSent) res.status(HttpStatus.NOT_FOUND);
      res.end();
    });
    stream.pipe(res);
  }
}
