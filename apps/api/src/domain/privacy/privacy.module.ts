import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../customer/entity/customer.entity';
import { Session } from '../session/entity/session.entity';
import { OrderCache } from '../order/entity/order-cache.entity';
import { OrderItem } from '../order/entity/order-item.entity';
import { Fulfillment } from '../order/entity/fulfillment.entity';
import { Conversation } from '../chat/entity/conversation.entity';
import { Message } from '../chat/entity/message.entity';
import { Notification } from '../notification/entity/notification.entity';
import { NotificationPref } from '../notification/entity/notification-pref.entity';
import { Review } from '../review/entity/review.entity';
import { Inquiry } from '../inquiry/entity/inquiry.entity';
import { CjmEvent } from '../cjm/entity/cjm-event.entity';
import { Affiliate } from '../affiliate/entity/affiliate.entity';
import { Subscription } from '../subscription/entity/subscription.entity';
import { RestockSubscription } from '../restock/entity/restock-subscription.entity';
import { Campaign } from '../campaign/entity/campaign.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { AuditModule } from '../audit/audit.module';
import { PrivacyService } from './privacy.service';
import { RetentionService } from './retention.service';
import { PrivacyController, ShopifyComplianceController } from './privacy.controller';

/**
 * Privacy / consumer-rights module: Shopify GDPR webhooks (audit High-2) and
 * widget DSAR/CCPA endpoints (audit High-3).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      Session,
      OrderCache,
      OrderItem,
      Fulfillment,
      Conversation,
      Message,
      Notification,
      NotificationPref,
      Review,
      Inquiry,
      CjmEvent,
      Affiliate,
      Subscription,
      RestockSubscription,
      Campaign,
      Tenant,
    ]),
    AuditModule,
  ],
  controllers: [ShopifyComplianceController, PrivacyController],
  providers: [PrivacyService, RetentionService],
})
export class PrivacyModule {}
