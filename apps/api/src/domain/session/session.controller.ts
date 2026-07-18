import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { SessionService } from './session.service';
import { SessionMapper } from './session.mapper';
import {
  ConsentRequest,
  EnsureSessionRequest,
  LanguageRequest,
} from './dto/request/session.request';
import { Public } from '../../global/decorator/public.decorator';

/** Widget-facing session endpoints (public; identified by opaque session token). */
@ApiTags('Session')
@Controller('session')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post('ensure')
  @Public()
  @SkipThrottle() // runs on every storefront page load — exclude from the flood limit
  @ApiOperation({ summary: 'Create or resume a widget session (S1)' })
  async ensure(@Body() body: EnsureSessionRequest) {
    const s = await this.sessionService.ensure(body.session_token, body.locale, body.shop_domain);
    return SessionMapper.toResponse(s);
  }

  @Post('consent')
  @Public()
  @ApiOperation({ summary: 'Record CCPA consent (FN-008)' })
  async consent(@Body() body: ConsentRequest) {
    const s = await this.sessionService.setConsent(body.session_token, body.granted);
    return { consentState: s.consentState };
  }

  @Post('language')
  @Public()
  @ApiOperation({ summary: 'Set UI language (en/es/ko)' })
  async language(@Body() body: LanguageRequest) {
    const s = await this.sessionService.setLanguage(body.session_token, body.language);
    return { language: s.language };
  }
}
