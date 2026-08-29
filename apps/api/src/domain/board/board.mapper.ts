import { Board } from './entity/board.entity';
import { BoardDocument } from './entity/board-document.entity';
import { BoardDocumentRevision } from './entity/board-document-revision.entity';
import { BOARD_ATTACHMENT_KIND, BoardAttachment } from './entity/board-attachment.entity';
import { signFileUrl } from '../../global/util/crypto.util';

/** Same TTL the chat attachment links use (PLN-260814 §5). */
const FILE_URL_TTL_SEC = 15 * 60;

export class BoardMapper {
  static toBoard(b: Board) {
    return { id: String(b.id), name: b.name, createdAt: b.createdAt };
  }

  /** List row — content stays out (LONGTEXT × a page of rows). */
  static toDocumentSummary(d: BoardDocument) {
    return {
      id: String(d.id),
      docGroup: d.docGroup,
      category1: d.category1,
      category2: d.category2 ?? null,
      title: d.title,
      teamLabel: d.teamLabel ?? null,
      tags: d.tags ?? [],
      status: d.status,
      authorUserId: d.authorUserId != null ? String(d.authorUserId) : null,
      updatedBy: d.updatedBy != null ? String(d.updatedBy) : null,
      promotedDocumentId: d.promotedDocumentId != null ? String(d.promotedDocumentId) : null,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  }

  static toDocument(d: BoardDocument, attachments: BoardAttachment[] = []) {
    return {
      ...this.toDocumentSummary(d),
      content: d.content ?? '',
      links: d.links ?? [],
      attachments: attachments.map((a) => this.toAttachment(a)),
    };
  }

  /** File rows mint a fresh signed URL per response; links pass through. */
  static toAttachment(a: BoardAttachment, now: number = Date.now()) {
    const exp = Math.floor(now / 1000) + FILE_URL_TTL_SEC;
    return {
      id: String(a.id),
      kind: a.kind,
      filename: a.filename,
      mime: a.mime ?? null,
      size: a.size ?? null,
      url:
        a.kind === BOARD_ATTACHMENT_KIND.LINK
          ? a.url
          : `/api/v1/board/files/${a.uuid}?exp=${exp}&sig=${signFileUrl(a.uuid, 'full', exp)}`,
      createdAt: a.createdAt,
    };
  }

  static toRevision(r: BoardDocumentRevision, withContent = false) {
    return {
      id: String(r.id),
      revisionNo: r.revisionNo,
      title: r.title,
      category1: r.category1 ?? null,
      category2: r.category2 ?? null,
      changedFields: r.changedFields ?? [],
      changeKind: r.changeKind,
      actorUserId: r.actorUserId != null ? String(r.actorUserId) : null,
      createdAt: r.createdAt,
      ...(withContent ? { content: r.content ?? '' } : {}),
    };
  }
}
