import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from '../chat/entity/conversation.entity';
import { Message } from '../chat/entity/message.entity';
import { Notification } from '../notification/entity/notification.entity';
import { CjmEvent } from '../cjm/entity/cjm-event.entity';
import { OrderCache } from '../order/entity/order-cache.entity';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation, Message, Notification, CjmEvent, OrderCache])],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
