import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign } from './entity/campaign.entity';
import { Customer } from '../customer/entity/customer.entity';
import { ProductCache } from '../product/entity/product-cache.entity';
import { CampaignService } from './campaign.service';
import { CampaignController } from './campaign.controller';
import { NotificationModule } from '../notification/notification.module';
import { ModerationModule } from '../moderation/moderation.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, Customer, ProductCache]),
    NotificationModule,
    ModerationModule,
    AuditModule,
  ],
  controllers: [CampaignController],
  providers: [CampaignService],
  exports: [CampaignService],
})
export class CampaignModule {}
