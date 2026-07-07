import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './entity/customer.entity';
import { OrderCache } from '../order/entity/order-cache.entity';
import { CustomerService } from './customer.service';
import { CustomerController } from './customer.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, OrderCache])],
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerModule {}
