import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Affiliate } from './entity/affiliate.entity';
import { Session } from '../session/entity/session.entity';
import { Customer } from '../customer/entity/customer.entity';
import { AffiliateService } from './affiliate.service';
import { AffiliateController } from './affiliate.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Affiliate, Session, Customer])],
  controllers: [AffiliateController],
  providers: [AffiliateService],
  exports: [AffiliateService],
})
export class AffiliateModule {}
