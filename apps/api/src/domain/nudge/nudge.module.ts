import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionModule } from '../session/session.module';
import { Nudge } from './entity/nudge.entity';
import { ProductCache } from '../product/entity/product-cache.entity';
import { Customer } from '../customer/entity/customer.entity';
import { Session } from '../session/entity/session.entity';
import { NudgeService } from './nudge.service';
import { NudgeController } from './nudge.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Nudge, ProductCache, Customer, Session]), SessionModule],
  controllers: [NudgeController],
  providers: [NudgeService],
  exports: [NudgeService],
})
export class NudgeModule {}
