import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { USER_RANK } from '@ivy/types';
import { BoardComment } from './entity/board-comment.entity';
import { User } from '../user/entity/user.entity';
import { BoardActor } from './board.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** More tags than this is a broadcast, not a mention (P5-2 spam guard). */
const MAX_MENTIONS = 10;

export interface BoardCommentView {
  id: string;
  body: string;
  mentions: Array<{ id: string; name: string }>;
  authorUserId: string;
  authorName: string;
  createdAt: Date;
}

/**
 * Comments + mentions on board documents (PLN-260829 B3).
 *
 * Mentions land in the comment row as cleaned tenant-user ids; the "inbox" is
 * a JSON_CONTAINS query, not an alert table — agent_alerts is conversation-
 * bound and a cross-screen bell is out of B3's scope (P5-3).
 */
@Injectable()
export class BoardCommentService {
  private readonly logger = new Logger(BoardCommentService.name);

  constructor(
    @InjectRepository(BoardComment) private readonly repo: Repository<BoardComment>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async listFor(tenantId: number, documentId: number): Promise<BoardCommentView[]> {
    const rows = await this.repo.find({
      where: { tenantId, documentId },
      order: { id: 'ASC' },
    });
    return this.withNames(tenantId, rows);
  }

  async create(
    tenantId: number,
    documentId: number,
    body: string,
    mentionIds: number[],
    actor: BoardActor,
  ): Promise<BoardCommentView> {
    const clean = body.trim();
    if (!clean) throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    // Cleaned against this tenant's users — a foreign id is dropped silently,
    // same stance as the category agent-scope validation.
    const wanted = [...new Set(mentionIds.map(Number).filter(Number.isFinite))].slice(0, MAX_MENTIONS);
    let mentions: number[] | null = null;
    if (wanted.length) {
      const owned = await this.userRepo.find({ where: { tenantId, id: In(wanted) } });
      const ids = owned.map((u) => Number(u.id));
      mentions = ids.length ? ids : null;
    }
    const saved = await this.repo.save(
      this.repo.create({
        tenantId,
        documentId,
        body: clean.slice(0, 4000),
        mentions,
        authorUserId: actor.userId,
      }),
    );
    return (await this.withNames(tenantId, [saved]))[0];
  }

  /** Author or master/director — mirrors the document delete rule. */
  async remove(tenantId: number, id: number, actor: BoardActor): Promise<void> {
    const row = await this.repo.findOne({ where: { id, tenantId } });
    if (!row) throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    const privileged = actor.rank === USER_RANK.MASTER || actor.rank === USER_RANK.DIRECTOR;
    if (Number(row.authorUserId) !== actor.userId && !privileged) {
      this.logger.warn(`board comment ${id} delete refused for user ${actor.userId}`);
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    await this.repo.delete({ id, tenantId });
  }

  /** Comments die with their document. */
  async removeAllFor(tenantId: number, documentId: number): Promise<void> {
    await this.repo.delete({ tenantId, documentId });
  }

  /** The caller's mention inbox — most recent first (P5-3). */
  async mentionsFor(tenantId: number, userId: number, limit = 50): Promise<BoardComment[]> {
    return this.repo
      .createQueryBuilder('c')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere('JSON_CONTAINS(c.mentions, :uid)', { uid: JSON.stringify(Number(userId)) })
      .orderBy('c.id', 'DESC')
      .take(limit)
      .getMany();
  }

  // ---- internals ----------------------------------------------------------

  /** Resolve author/mention names in one batched read per response. */
  private async withNames(tenantId: number, rows: BoardComment[]): Promise<BoardCommentView[]> {
    const ids = [
      ...new Set(rows.flatMap((r) => [Number(r.authorUserId), ...(r.mentions ?? []).map(Number)])),
    ];
    const users = ids.length ? await this.userRepo.find({ where: { tenantId, id: In(ids) } }) : [];
    const nameOf = new Map(users.map((u) => [Number(u.id), u.name || u.email]));
    return rows.map((r) => ({
      id: String(r.id),
      body: r.body,
      mentions: (r.mentions ?? []).map((m) => ({
        id: String(m),
        name: nameOf.get(Number(m)) ?? `#${m}`,
      })),
      authorUserId: String(r.authorUserId),
      authorName: nameOf.get(Number(r.authorUserId)) ?? `#${r.authorUserId}`,
      createdAt: r.createdAt,
    }));
  }
}
