import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionModule } from '../session/session.module';
import { ProductSave } from './entity/product-save.entity';
import { ProductCache } from '../product/entity/product-cache.entity';
import { Session } from '../session/entity/session.entity';
import { SaveService } from './save.service';
import { SaveController } from './save.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ProductSave, ProductCache, Session]), SessionModule],
  controllers: [SaveController],
  providers: [SaveService],
  exports: [SaveService],
})
export class SaveModule {}
