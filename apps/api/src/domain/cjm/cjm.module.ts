import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CjmEvent } from './entity/cjm-event.entity';
import { CjmService } from './cjm.service';
import { CjmController } from './cjm.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CjmEvent])],
  controllers: [CjmController],
  providers: [CjmService],
  exports: [CjmService],
})
export class CjmModule {}
