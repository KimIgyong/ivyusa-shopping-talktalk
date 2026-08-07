import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionModule } from '../session/session.module';
import { ModerationModule } from '../moderation/moderation.module';
import { Review } from './entity/review.entity';
import { Session } from '../session/entity/session.entity';
import { OrderItem } from '../order/entity/order-item.entity';
import { OrderCache } from '../order/entity/order-cache.entity';
import { ReviewService } from './review.service';
import { ReviewController } from './review.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Review, Session, OrderItem, OrderCache]),
    SessionModule,
    // D2 — review bodies pass the same non-bypassable moderation gate (FR-069).
    ModerationModule,
  ],
  controllers: [ReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
