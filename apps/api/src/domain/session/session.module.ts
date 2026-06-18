import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from './entity/session.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Session, Tenant])],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
