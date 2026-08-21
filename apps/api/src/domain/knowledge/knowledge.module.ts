import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeSource } from './entity/knowledge-source.entity';
import { KbDocument } from './entity/kb-document.entity';
import { KbBoardPost } from './entity/kb-board-post.entity';
import { KbFile } from './entity/kb-file.entity';
import { KbConflict } from './entity/kb-conflict.entity';
import { KbDocumentRevision } from './entity/kb-document-revision.entity';
import { ProductCache } from '../product/entity/product-cache.entity';
import { KnowledgeService } from './knowledge.service';
import { KbConflictService } from './kb-conflict.service';
import { KbRevisionService } from './kb-revision.service';
import { ProductImportService } from './product-import.service';
import { CatalogSyncService } from './catalog-sync.service';
import { CatalogSyncJobService } from './catalog-sync-job.service';
import { AnswerProposalService } from './answer-proposal.service';
import { KbAnswerProposal } from './entity/kb-answer-proposal.entity';
import { UsageGuideService } from './usage-guide.service';
import { SourceSyncService } from './source-sync.service';
import { BoardAdapter } from './adapters/board.adapter';
import { GdriveAdapter } from './adapters/gdrive.adapter';
import { GdriveClient } from './gdrive.client';
import { GdriveCredentialService } from './gdrive-credential.service';
import { NotionAdapter } from './adapters/notion.adapter';
import { NotionClient } from './notion.client';
import { NotionCredentialService } from './notion-credential.service';
import { IntegrationCredential } from '../tenant/entity/integration-credential.entity';
import { AuditModule } from '../audit/audit.module';
import { KnowledgeGapTask } from './entity/knowledge-gap-task.entity';
import { QuestionStatDaily } from '../analytics/entity/question-stat-daily.entity';
import { Message } from '../chat/entity/message.entity';
import { KnowledgeGapService } from './knowledge-gap.service';
import { KnowledgeController } from './knowledge.controller';
import { AgentKnowledgeController } from './agent-knowledge.controller';
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
      KbAnswerProposal,
      // Repository only — the CSV import's optional Price/Image bridge writes
      // into the display catalog (PLN-260807 F1). No ProductModule import.
      ProductCache,
      KnowledgeGapTask,
      QuestionStatDaily,
      Message,
      // Repository only — the Drive service-account key and the Notion token
      // live with the other provider secrets; no TenantModule import.
      IntegrationCredential,
    ]),
    // RagService answers the console's knowledge questions; Chat does not depend
    // on Knowledge, so this stays acyclic.
    ChatModule,
    ModerationModule,
    // Knowledge edits were the one privileged action leaving no audit trail.
    AuditModule,
  ],
  controllers: [KnowledgeController, AgentKnowledgeController],
  providers: [
    KnowledgeService,
    KnowledgeGapService,
    KbConflictService,
    KbRevisionService,
    ProductImportService,
    CatalogSyncService,
    CatalogSyncJobService,
    AnswerProposalService,
    UsageGuideService,
    SourceSyncService,
    BoardAdapter,
    GdriveAdapter,
    GdriveClient,
    GdriveCredentialService,
    NotionAdapter,
    NotionClient,
    NotionCredentialService,
  ],
  exports: [KnowledgeService, KbConflictService, KbRevisionService],
})
export class KnowledgeModule {}
