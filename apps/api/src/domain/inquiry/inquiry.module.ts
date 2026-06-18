import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inquiry } from './entity/inquiry.entity';
import { Session } from '../session/entity/session.entity';
import { InquiryService } from './inquiry.service';
import { AdminInquiryController, InquiryController } from './inquiry.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Inquiry, Session])],
  controllers: [InquiryController, AdminInquiryController],
  providers: [InquiryService],
  exports: [InquiryService],
})
export class InquiryModule {}
