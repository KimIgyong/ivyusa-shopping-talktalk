import { KnowledgeSource } from './entity/knowledge-source.entity';

/**
 * One piece of source content, normalised for the ingestion pipeline.
 *
 * Adapters produce these and nothing else — upserting, embedding, history and
 * hiding removed items all live in the pipeline, so a new source type is one
 * `fetchAll` away rather than a reimplementation of the whole flow.
 */
export interface SourceItem {
  /**
   * Stable identity within the source. The pipeline upserts on it, so it must
   * survive a title change — a board post's id, not its heading.
   */
  externalKey: string;
  title: string;
  content: string;
  sourceUrl: string | null;
  category: string | null;
}

export interface SourceAdapter {
  readonly type: string;

  /**
   * Whether an empty listing proves the source is empty.
   *
   * True for a source we query directly (an empty board really has no posts).
   * False for anything behind someone else's API, where "no items" is also what
   * revoked access looks like — treating that as authoritative would hide every
   * document from the source the first time a permission lapses. Defaults to
   * true so an internal adapter need not think about it.
   */
  readonly trustEmptyListing?: boolean;

  /**
   * Check a source's configuration before it is saved. Returns a human-readable
   * reason when invalid, or null when it is usable.
   *
   * Validating up front matters because the alternative — accepting anything
   * and discovering it at sync time — is how the three source types ended up
   * registrable but non-functional in the first place.
   */
  validateConfig(config: Record<string, unknown> | null): string | null;

  /**
   * Every item the source currently holds. Deliberately a full listing rather
   * than a delta: the pipeline already compares against what it stored last
   * time, and "what exists now" is the only question an adapter can answer
   * without keeping its own bookkeeping.
   */
  fetchAll(tenantId: number, source: KnowledgeSource): Promise<SourceItem[]>;
}
