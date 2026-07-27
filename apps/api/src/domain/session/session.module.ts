import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from './entity/session.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { Customer } from '../customer/entity/customer.entity';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';

@Module({
  // Customer is registered for the repository only (display name lookup) — no
  // CustomerModule import, which would create a Session ↔ Customer cycle.
  imports: [TypeOrmModule.forFeature([Session, Tenant, Customer])],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
