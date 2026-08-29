import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { USER_RANK } from '@ivy/types';
import { Board } from './entity/board.entity';
import { BOARD_DOC_STATUS, BoardDocument } from './entity/board-document.entity';
import {
  BOARD_REVISION_KIND,
  BoardDocumentRevision,
} from './entity/board-document-revision.entity';
import { DOC_GROUP, KbDocument } from '../knowledge/entity/kb-document.entity';
import { Paginated } from '../../global/interceptor/transform.interceptor';
import { buildPagination, normalizePage } from '@ivy/common';
import { BoardMapper } from './board.mapper';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

export interface BoardActor {
  userId: number;
  rank: string;
}

export interface BoardDocumentInput {
  doc_group?: string;
  category1: string;
  category2?: string | null;
  title: string;
  team_label?: string | null;
  content?: string | null;
  tags?: string[];
  status?: string;
}

export interface BoardListQuery {
  group?: string;
  category1?: string;
  category2?: string;
  tag?: string;
  status?: string;
  search?: string;
  page?: string;
  size?: string;
}

/**
 * Smart Knowledge Board core (PLN-260829 B1) — the curation layer every piece
 * of knowledge is written into before an operator adopts it into kb_documents
 * (adoption itself is B2). Documents are Markdown; [[wikilinks]] are parsed at
 * save time so backlinks (B3) never have to scan bodies.
 */
@Injectable()
export class BoardService {
  private readonly logger = new Logger(BoardService.name);

  constructor(
    @InjectRepository(Board) private readonly boardRepo: Repository<Board>,
    @InjectRepository(BoardDocument) private readonly docRepo: Repository<BoardDocument>,
    @InjectRepository(BoardDocumentRevision)
    private readonly revRepo: Repository<BoardDocumentRevision>,
    @InjectRepository(KbDocument) private readonly kbRepo: Repository<KbDocument>,
  ) {}

  /**
   * Every tenant has exactly one default board (REQ #1). The migration
   * backfills existing tenants; this lazy ensure covers every tenant created
   * afterwards by ANY path — a creation hook can be skipped, a first API
   * touch cannot.
   */
  async ensureDefault(tenantId: number): Promise<Board> {
    const existing = await this.boardRepo.findOne({ where: { tenantId } });
    if (existing) return existing;
    return this.boardRepo
      .save(this.boardRepo.create({ tenantId, name: 'Smart Knowledge Board' }))
      .catch(async (e) => {
        // A concurrent first-touch lost the unique-key race — the winner's row
        // is the board.
        const raced = await this.boardRepo.findOne({ where: { tenantId } });
        if (raced) return raced;
        throw e;
      });
  }

  async list(tenantId: number, q: BoardListQuery) {
    await this.ensureDefault(tenantId);
    const { page, size } = normalizePage(q.page, q.size);
    const qb = this.docRepo
      .createQueryBuilder('d')
      .where('d.tenant_id = :tenantId', { tenantId });
    if (q.group) qb.andWhere('d.doc_group = :group', { group: q.group });
    if (q.category1) qb.andWhere('d.category1 = :c1', { c1: q.category1 });
    if (q.category2) qb.andWhere('d.category2 = :c2', { c2: q.category2 });
    if (q.status) qb.andWhere('d.status = :status', { status: q.status });
    if (q.tag) qb.andWhere('JSON_CONTAINS(d.tags, :tag)', { tag: JSON.stringify(q.tag) });
    if (q.search?.trim()) {
      qb.andWhere('MATCH(d.title, d.content) AGAINST (:q IN NATURAL LANGUAGE MODE)', {
        q: q.search.trim(),
      });
    }
    const [items, total] = await qb
      .orderBy('d.updated_at', 'DESC')
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();
    return new Paginated(
      items.map((d) => BoardMapper.toDocumentSummary(d)),
      buildPagination(page, size, total),
    );
  }

  /** group → category1 → category2 counts for the list navigator, one query. */
  async categoryCounts(tenantId: number) {
    const rows = await this.docRepo
      .createQueryBuilder('d')
      .select('d.doc_group', 'grp')
      .addSelect('d.category1', 'c1')
      .addSelect('d.category2', 'c2')
      .addSelect('COUNT(*)', 'total')
      .where('d.tenant_id = :tenantId', { tenantId })
      .groupBy('d.doc_group')
      .addGroupBy('d.category1')
      .addGroupBy('d.category2')
      .getRawMany<{ grp: string; c1: string; c2: string | null; total: string }>();
    return rows.map((r) => ({
      group: r.grp,
      category1: r.c1,
      category2: r.c2,
      total: Number(r.total),
    }));
  }

  /**
   * Adoption state for the detail view (B2 P4-3): whether the board copy has
   * moved past what the KB carries. Compared by CONTENT (title+body), not
   * timestamps — second-granularity clocks miss a quick edit-after-promote,
   * and a reviewer's category override must not read as forever-behind.
   */
  async reviewMeta(
    tenantId: number,
    doc: BoardDocument,
  ): Promise<{ kbDocumentId: string | null; revisionBehind: boolean }> {
    if (doc.promotedDocumentId == null) return { kbDocumentId: null, revisionBehind: false };
    const kb = await this.kbRepo?.findOne({ where: { id: doc.promotedDocumentId, tenantId } });
    if (!kb) return { kbDocumentId: null, revisionBehind: false };
    return {
      kbDocumentId: String(kb.id),
      revisionBehind: doc.title !== kb.title || (doc.content ?? '') !== (kb.content ?? ''),
    };
  }

  async get(tenantId: number, id: number): Promise<BoardDocument> {
    const doc = await this.docRepo.findOne({ where: { id, tenantId } });
    if (!doc) throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    return doc;
  }

  async create(tenantId: number, body: BoardDocumentInput, actor: BoardActor): Promise<BoardDocument> {
    const board = await this.ensureDefault(tenantId);
    this.validate(body);
    const doc = await this.docRepo.save(
      this.docRepo.create({
        tenantId,
        boardId: Number(board.id),
        docGroup: body.doc_group ?? DOC_GROUP.COUNSEL,
        category1: body.category1.trim(),
        category2: body.category2?.trim() || null,
        title: body.title.trim(),
        teamLabel: body.team_label?.trim() || null,
        content: body.content ?? null,
        tags: this.cleanTags(body.tags),
        links: this.parseWikiLinks(body.content),
        status: body.status === BOARD_DOC_STATUS.PUBLISHED ? BOARD_DOC_STATUS.PUBLISHED : BOARD_DOC_STATUS.DRAFT,
        authorUserId: actor.userId,
        updatedBy: null,
      }),
    );
    await this.snapshot(doc, ['*'], BOARD_REVISION_KIND.CREATE, actor.userId);
    return doc;
  }

  async update(
    tenantId: number,
    id: number,
    body: Partial<BoardDocumentInput>,
    actor: BoardActor,
  ): Promise<BoardDocument> {
    const doc = await this.get(tenantId, id);
    const changed: string[] = [];
    const set = <K extends keyof BoardDocument>(key: K, value: BoardDocument[K]) => {
      if (doc[key] !== value) {
        doc[key] = value;
        changed.push(String(key));
      }
    };
    if (body.title !== undefined) set('title', body.title.trim() as BoardDocument['title']);
    if (body.category1 !== undefined) set('category1', body.category1.trim());
    if (body.category2 !== undefined) set('category2', body.category2?.trim() || null);
    if (body.doc_group !== undefined) set('docGroup', body.doc_group);
    if (body.team_label !== undefined) set('teamLabel', body.team_label?.trim() || null);
    if (body.status !== undefined) {
      if (![BOARD_DOC_STATUS.DRAFT, BOARD_DOC_STATUS.PUBLISHED].includes(body.status as never)) {
        // promoted/rejected are B2 transitions — the editor cannot set them.
        throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
      }
      set('status', body.status);
    }
    if (body.tags !== undefined) {
      doc.tags = this.cleanTags(body.tags);
      changed.push('tags');
    }
    if (body.content !== undefined && body.content !== doc.content) {
      doc.content = body.content;
      doc.links = this.parseWikiLinks(body.content);
      changed.push('content');
    }
    this.validate({ category1: doc.category1, title: doc.title });
    if (!changed.length) return doc;
    doc.updatedBy = actor.userId;
    const saved = await this.docRepo.save(doc);
    await this.snapshot(saved, changed, BOARD_REVISION_KIND.UPDATE, actor.userId);
    return saved;
  }

  /** Author or master/director — a junior deleting a colleague's doc is a call
   * their lead makes, not the API. */
  async remove(tenantId: number, id: number, actor: BoardActor): Promise<void> {
    const doc = await this.get(tenantId, id);
    const privileged = actor.rank === USER_RANK.MASTER || actor.rank === USER_RANK.DIRECTOR;
    if (Number(doc.authorUserId) !== actor.userId && !privileged) {
      this.logger.warn(`board doc ${id} delete refused for user ${actor.userId} (rank ${actor.rank})`);
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    // Last snapshot before the row goes — hard delete, same stance as KB.
    await this.snapshot(doc, ['*'], BOARD_REVISION_KIND.DELETE, actor.userId);
    await this.docRepo.delete({ id, tenantId });
  }

  async revisions(tenantId: number, documentId: number): Promise<BoardDocumentRevision[]> {
    await this.get(tenantId, documentId);
    return this.revRepo.find({
      where: { tenantId, documentId },
      order: { revisionNo: 'DESC' },
    });
  }

  async revision(tenantId: number, documentId: number, revisionId: number) {
    const rev = await this.revRepo.findOne({ where: { id: revisionId, tenantId, documentId } });
    if (!rev) throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    return rev;
  }

  async restore(tenantId: number, documentId: number, revisionId: number, actor: BoardActor) {
    const rev = await this.revision(tenantId, documentId, revisionId);
    return this.update(
      tenantId,
      documentId,
      {
        title: rev.title,
        content: rev.content ?? '',
        category1: rev.category1 ?? undefined,
        category2: rev.category2,
      },
      actor,
    );
  }

  // ---- internals ----------------------------------------------------------

  private validate(body: { category1?: string; title?: string }): void {
    if (!body.title?.trim() || !body.category1?.trim()) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
  }

  private cleanTags(tags?: string[]): string[] | null {
    const clean = [...new Set((tags ?? []).map((t) => t.trim()).filter(Boolean))].slice(0, 20);
    return clean.length ? clean : null;
  }

  /** `[[문서 제목]]` targets, deduped — backlink material for B3. */
  private parseWikiLinks(content?: string | null): string[] | null {
    if (!content) return null;
    const targets = [...content.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)]
      .map((m) => m[1].trim())
      .filter(Boolean);
    const unique = [...new Set(targets)].slice(0, 100);
    return unique.length ? unique : null;
  }

  private async snapshot(
    doc: BoardDocument,
    changedFields: string[],
    kind: string,
    actorUserId: number,
  ): Promise<void> {
    const last = await this.revRepo.findOne({
      where: { documentId: Number(doc.id) },
      order: { revisionNo: 'DESC' },
    });
    await this.revRepo.save(
      this.revRepo.create({
        tenantId: doc.tenantId,
        documentId: Number(doc.id),
        // Max+1, never count+1 (kit lesson B-1) — a deleted middle revision
        // must not make two snapshots share a number.
        revisionNo: (last?.revisionNo ?? 0) + 1,
        title: doc.title,
        content: doc.content,
        category1: doc.category1,
        category2: doc.category2,
        changedFields,
        changeKind: kind,
        actorUserId,
      }),
    );
  }
}
