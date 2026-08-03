import { KnowledgeSource } from './entity/knowledge-source.entity';
import { KbDocument } from './entity/kb-document.entity';
import { KbBoardPost } from './entity/kb-board-post.entity';
import { isStale } from './kb-conflict.service';

/** When this document next falls due for review, or null if no cadence is set. */
function reviewDueAt(d: KbDocument): Date | null {
  if (!d.reviewIntervalDays || d.reviewIntervalDays <= 0) return null;
  const anchor = d.reviewedAt ?? d.updatedAt;
  if (!anchor) return null;
  const due = new Date(anchor);
  due.setDate(due.getDate() + d.reviewIntervalDays);
  return due;
}

/** Entity -> camelCase response mapping for the knowledge domain. */
export class KnowledgeMapper {
  static toSource(s: KnowledgeSource) {
    return {
      id: s.id,
      type: s.type,
      name: s.name,
      status: s.status,
      designated: s.designated,
      configJson: s.configJson ?? null,
      createdAt: s.createdAt,
    };
  }

  static toSourceList(sources: KnowledgeSource[]) {
    return sources.map((s) => this.toSource(s));
  }

  static toDocument(d: KbDocument) {
    return {
      id: d.id,
      source: d.source,
      sourceId: d.sourceId ?? null,
      category: d.category ?? null,
      title: d.title,
      content: d.content ?? null,
      embeddingRef: d.embeddingRef ?? null,
      active: d.active,
      status: d.status,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      // Provenance & staleness (PLN D7). `stale` is derived rather than stored
      // so it cannot drift out of date between writes.
      sourceUrl: d.sourceUrl ?? null,
      ownerUserId: d.ownerUserId ?? null,
      effectiveFrom: d.effectiveFrom ?? null,
      reviewIntervalDays: d.reviewIntervalDays ?? null,
      reviewedAt: d.reviewedAt ?? null,
      reviewedBy: d.reviewedBy ?? null,
      supersededBy: d.supersededBy ?? null,
      stale: isStale(d),
      reviewDueAt: reviewDueAt(d),
    };
  }

  static toDocumentList(docs: KbDocument[]) {
    return docs.map((d) => this.toDocument(d));
  }

  static toPost(p: KbBoardPost) {
    return {
      id: p.id,
      sourceId: p.sourceId,
      title: p.title,
      body: p.body ?? null,
      authorUserId: p.authorUserId ?? null,
      createdAt: p.createdAt,
    };
  }

  static toPostList(posts: KbBoardPost[]) {
    return posts.map((p) => this.toPost(p));
  }
}
