import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KbBoardPost } from '../entity/kb-board-post.entity';
import { KnowledgeSource } from '../entity/knowledge-source.entity';
import { SourceAdapter, SourceItem } from '../source-adapter.interface';

/**
 * Internal knowledge board (PLN-260804 D5).
 *
 * Posts have been storable since the beginning but never became knowledge:
 * `createPost` wrote a `kb_board_posts` row and stopped there, so the board was
 * a table nobody could retrieve from. This adapter is what connects it.
 *
 * The only source type with no external dependency — no credentials, no rate
 * limit — which is why the pipeline is proven against it first.
 */
@Injectable()
export class BoardAdapter implements SourceAdapter {
  readonly type = 'board';

  constructor(
    @InjectRepository(KbBoardPost) private readonly postRepo: Repository<KbBoardPost>,
  ) {}

  /** An internal board has nothing to configure. */
  validateConfig(): string | null {
    return null;
  }

  async fetchAll(tenantId: number, source: KnowledgeSource): Promise<SourceItem[]> {
    const posts = await this.postRepo.find({
      where: { tenantId, sourceId: source.id },
      order: { id: 'ASC' },
    });
    return posts
      // A post with no body carries nothing to retrieve on; skipping it keeps
      // empty drafts out of the index instead of burning an embedding on them.
      .filter((p) => (p.body ?? '').trim().length > 0)
      .map((p) => ({
        // Keyed by id, not title: renaming a post must update the document
        // rather than orphan the old one and create a second.
        externalKey: `post:${p.id}`,
        title: p.title,
        content: p.body ?? '',
        sourceUrl: null,
        category: source.name,
      }));
  }
}
