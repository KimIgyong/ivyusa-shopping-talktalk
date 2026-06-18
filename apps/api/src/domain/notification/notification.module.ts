import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entity/notification.entity';
import { NotificationPref } from './entity/notification-pref.entity';
import { Session } from '../session/entity/session.entity';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, NotificationPref, Session])],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
