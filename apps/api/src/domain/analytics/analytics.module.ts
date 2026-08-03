import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from '../chat/entity/conversation.entity';
import { Message } from '../chat/entity/message.entity';
import { Notification } from '../notification/entity/notification.entity';
import { CjmEvent } from '../cjm/entity/cjm-event.entity';
import { OrderCache } from '../order/entity/order-cache.entity';
import { Session } from '../session/entity/session.entity';
import { Customer } from '../customer/entity/customer.entity';
import { User } from '../user/entity/user.entity';
import { AuditModule } from '../audit/audit.module';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Conversation,
      Message,
      Notification,
      CjmEvent,
      OrderCache,
      Session,
      Customer,
      User,
    ]),
    // Reading a transcript is a PII access and is audited like the agent
    // console's equivalent route (PRV-H4).
    AuditModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
