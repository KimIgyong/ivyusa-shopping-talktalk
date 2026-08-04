import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeSource } from './entity/knowledge-source.entity';
import { KbDocument } from './entity/kb-document.entity';
import { KbBoardPost } from './entity/kb-board-post.entity';
import { KbFile } from './entity/kb-file.entity';
import { KbConflict } from './entity/kb-conflict.entity';
import { KbDocumentRevision } from './entity/kb-document-revision.entity';
import { KnowledgeService } from './knowledge.service';
import { KbConflictService } from './kb-conflict.service';
import { KbRevisionService } from './kb-revision.service';
import { ProductImportService } from './product-import.service';
import { SourceSyncService } from './source-sync.service';
import { BoardAdapter } from './adapters/board.adapter';
import { AuditModule } from '../audit/audit.module';
import { KnowledgeController } from './knowledge.controller';
import { ChatModule } from '../chat/chat.module';
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KnowledgeSource,
      KbDocument,
      KbBoardPost,
      KbFile,
      KbConflict,
      KbDocumentRevision,
    ]),
    // RagService answers the console's knowledge questions; Chat does not depend
    // on Knowledge, so this stays acyclic.
    ChatModule,
    ModerationModule,
    // Knowledge edits were the one privileged action leaving no audit trail.
    AuditModule,
  ],
  controllers: [KnowledgeController],
  providers: [
    KnowledgeService,
    KbConflictService,
    KbRevisionService,
    ProductImportService,
    SourceSyncService,
    BoardAdapter,
  ],
  exports: [KnowledgeService, KbConflictService, KbRevisionService],
})
export class KnowledgeModule {}
