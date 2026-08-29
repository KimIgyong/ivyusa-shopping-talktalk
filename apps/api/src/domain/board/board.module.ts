import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Board } from './entity/board.entity';
import { BoardDocument } from './entity/board-document.entity';
import { BoardDocumentRevision } from './entity/board-document-revision.entity';
import { BoardAttachment } from './entity/board-attachment.entity';
import { KbDocument } from '../knowledge/entity/kb-document.entity';
import { BoardComment } from './entity/board-comment.entity';
import { User } from '../user/entity/user.entity';
import { BoardService } from './board.service';
import { BoardAttachmentService } from './board-attachment.service';
import { BoardCommentService } from './board-comment.service';
import { BoardImportService } from './board-import.service';
import { AuditModule } from '../audit/audit.module';
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
      BoardComment,
      // Repository only — author/mention names on comments; no UserModule import.
      User,
    ]),
    // FAQ import writes an audit entry (B4 P6-1).
    AuditModule,
  ],
  providers: [BoardService, BoardAttachmentService, BoardCommentService, BoardImportService],
  controllers: [BoardController],
  exports: [BoardService, BoardAttachmentService],
})
export class BoardModule {}
