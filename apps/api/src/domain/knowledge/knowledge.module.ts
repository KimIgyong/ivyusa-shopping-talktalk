import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeSource } from './entity/knowledge-source.entity';
import { KbDocument } from './entity/kb-document.entity';
import { KbBoardPost } from './entity/kb-board-post.entity';
import { KbFile } from './entity/kb-file.entity';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeController } from './knowledge.controller';

@Module({
  imports: [TypeOrmModule.forFeature([KnowledgeSource, KbDocument, KbBoardPost, KbFile])],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
