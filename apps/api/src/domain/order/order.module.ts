import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderCache } from './entity/order-cache.entity';
import { OrderItem } from './entity/order-item.entity';
import { Fulfillment } from './entity/fulfillment.entity';
import { Session } from '../session/entity/session.entity';
import { Customer } from '../customer/entity/customer.entity';
import { OrderService } from './order.service';
import { AdminOrderController, OrderController } from './order.controller';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [TypeOrmModule.forFeature([OrderCache, OrderItem, Fulfillment, Session, Customer])],
  controllers: [OrderController, AdminOrderController, WebhookController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
