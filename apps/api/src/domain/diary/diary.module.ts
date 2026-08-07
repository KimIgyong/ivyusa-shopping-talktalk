import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionModule } from '../session/session.module';
import { DiaryNote } from './entity/diary-note.entity';
import { ProductCache } from '../product/entity/product-cache.entity';
import { DiaryService } from './diary.service';
import { DiaryController } from './diary.controller';

@Module({
  // ProductCache is repository-only here: create() validates a pinned handle
  // against the tenant catalog.
  imports: [TypeOrmModule.forFeature([DiaryNote, ProductCache]), SessionModule],
  controllers: [DiaryController],
  providers: [DiaryService],
  exports: [DiaryService],
})
export class DiaryModule {}
