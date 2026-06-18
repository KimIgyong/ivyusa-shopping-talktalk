import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription } from './entity/subscription.entity';
import { Session } from '../session/entity/session.entity';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Subscription, Session])],
  controllers: [SubscriptionController],
  providers: [SubscriptionService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
