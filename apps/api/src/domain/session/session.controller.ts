import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { SessionService } from './session.service';
import { Public } from '../../global/decorator/public.decorator';

class EnsureSessionRequest {
  @IsOptional() @IsString() session_token?: string;
  @IsOptional() @IsString() locale?: string;
  @IsOptional() @IsString() shop_domain?: string;
}
class ConsentRequest {
  @IsString() session_token: string;
  @IsBoolean() granted: boolean;
}
class LanguageRequest {
  @IsString() session_token: string;
  @IsString() language: string;
}

/** Widget-facing session endpoints (public; identified by opaque session token). */
@ApiTags('Session')
@Controller('session')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post('ensure')
  @Public()
  @ApiOperation({ summary: 'Create or resume a widget session (S1)' })
  async ensure(@Body() body: EnsureSessionRequest) {
    const s = await this.sessionService.ensure(body.session_token, body.locale, body.shop_domain);
    return {
      sessionToken: s.sessionToken,
      language: s.language,
      consentState: s.consentState,
      authenticated: s.customerId != null,
    };
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
