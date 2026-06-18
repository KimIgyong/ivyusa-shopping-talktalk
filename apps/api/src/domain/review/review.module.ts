import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review } from './entity/review.entity';
import { Session } from '../session/entity/session.entity';
import { OrderItem } from '../order/entity/order-item.entity';
import { ReviewService } from './review.service';
import { ReviewController } from './review.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Review, Session, OrderItem])],
  controllers: [ReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
