import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeSource } from './entity/knowledge-source.entity';
import { KbDocument } from './entity/kb-document.entity';
import { KbBoardPost } from './entity/kb-board-post.entity';
import { KbFile } from './entity/kb-file.entity';
import { KbConflict } from './entity/kb-conflict.entity';
import { KnowledgeService } from './knowledge.service';
import { KbConflictService } from './kb-conflict.service';
import { KnowledgeController } from './knowledge.controller';
import { ChatModule } from '../chat/chat.module';
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([KnowledgeSource, KbDocument, KbBoardPost, KbFile, KbConflict]),
    // RagService answers the console's knowledge questions; Chat does not depend
    // on Knowledge, so this stays acyclic.
    ChatModule,
    ModerationModule,
  ],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, KbConflictService],
  exports: [KnowledgeService, KbConflictService],
})
export class KnowledgeModule {}
