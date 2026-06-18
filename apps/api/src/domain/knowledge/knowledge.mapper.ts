import { KnowledgeSource } from './entity/knowledge-source.entity';
import { KbDocument } from './entity/kb-document.entity';
import { KbBoardPost } from './entity/kb-board-post.entity';

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
      updatedAt: d.updatedAt,
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
