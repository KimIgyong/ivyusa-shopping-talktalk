import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Board } from './entity/board.entity';
import { BoardDocument } from './entity/board-document.entity';
import { BoardDocumentRevision } from './entity/board-document-revision.entity';
import { BoardAttachment } from './entity/board-attachment.entity';
import { KbDocument } from '../knowledge/entity/kb-document.entity';
import { BoardService } from './board.service';
import { BoardAttachmentService } from './board-attachment.service';
import { BoardController } from './board.controller';

/** Smart Knowledge Board (PLN-260829 B1) — the curation layer above kb_documents. */
@Module({
  imports: [TypeOrmModule.forFeature([
      Board,
      BoardDocument,
      BoardDocumentRevision,
      BoardAttachment,
      // Repository only — the revision-behind check compares against the
      // adopted KB row (B2 P4-3); no KnowledgeModule import.
      KbDocument,
    ])],
  providers: [BoardService, BoardAttachmentService],
  controllers: [BoardController],
  exports: [BoardService],
})
export class BoardModule {}
