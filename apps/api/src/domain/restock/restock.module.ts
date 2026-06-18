import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RestockSubscription } from './entity/restock-subscription.entity';
import { Session } from '../session/entity/session.entity';
import { RestockService } from './restock.service';
import { RestockController } from './restock.controller';

@Module({
  imports: [TypeOrmModule.forFeature([RestockSubscription, Session])],
  controllers: [RestockController],
  providers: [RestockService],
  exports: [RestockService],
})
export class RestockModule {}
