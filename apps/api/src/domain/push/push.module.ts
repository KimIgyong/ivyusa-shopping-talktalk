import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceToken } from './entity/device-token.entity';
import { Session } from '../session/entity/session.entity';
import { PushService } from './push.service';
import { PushController } from './push.controller';
import { ExpoPushProvider } from './provider/expo-push.provider';
import { WebPushProvider } from './provider/web-push.provider';
import { PUSH_PROVIDER, WEB_PUSH_PROVIDER } from './provider/push-provider.interface';

@Module({
  imports: [TypeOrmModule.forFeature([DeviceToken, Session])],
  controllers: [PushController],
  providers: [
    PushService,
    { provide: PUSH_PROVIDER, useClass: ExpoPushProvider },
    { provide: WEB_PUSH_PROVIDER, useClass: WebPushProvider },
  ],
  exports: [PushService],
})
export class PushModule {}
