import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PushService } from './push.service';
import { RegisterPushRequest, UnregisterPushRequest } from './dto/request/push.request';
import { toDeviceTokenResponse } from './push.mapper';
import { Public } from '../../global/decorator/public.decorator';
import { SessionToken } from '../../global/decorator/session-token.decorator';

/** Mobile-app push registration endpoints (public; session-token identified). */
@ApiTags('Push')
@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Post('register')
  @Public()
  @ApiOperation({ summary: 'Register/refresh a mobile device push token (REQ-MobileApp M1)' })
  async register(@SessionToken() token: string, @Body() body: RegisterPushRequest) {
    const row = await this.pushService.register(token, body);
    return toDeviceTokenResponse(row);
  }

  @Post('unregister')
  @Public()
  @ApiOperation({ summary: 'Revoke a mobile device push token (idempotent)' })
  async unregister(@SessionToken() token: string, @Body() body: UnregisterPushRequest) {
    await this.pushService.unregister(token, body.token);
    return { revoked: true };
  }
}
