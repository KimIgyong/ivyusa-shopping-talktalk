import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CjmEvent } from './entity/cjm-event.entity';
import { CjmService } from './cjm.service';
import { CjmController, CjmMeController } from './cjm.controller';
import { SessionModule } from '../session/session.module';

@Module({
  // SessionModule: the customer-facing /me/journey endpoint resolves the bound
  // customer through the shared widget-session gate.
  imports: [TypeOrmModule.forFeature([CjmEvent]), SessionModule],
  controllers: [CjmController, CjmMeController],
  providers: [CjmService],
  exports: [CjmService],
})
export class CjmModule {}
