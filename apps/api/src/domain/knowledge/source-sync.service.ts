import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DOC_GROUP, KbDocument } from './entity/kb-document.entity';
import { KnowledgeSource } from './entity/knowledge-source.entity';
import { REVISION_KIND } from './entity/kb-document-revision.entity';
import { KbRevisionService } from './kb-revision.service';
import { SourceAdapter, SourceItem } from './source-adapter.interface';
import { BoardAdapter } from './adapters/board.adapter';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

export interface SyncResult {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  /** Documents whose source item disappeared — hidden, never deleted (D7). */
  hidden: number;
  failed: number;
}

/**
 * Shared ingestion pipeline for every knowledge source (PLN-260804 S1).
 *
 * Adapters answer one question — "what does the source hold right now" — and
 * everything downstream happens here: upserting on a stable key, skipping
 * unchanged content, hiding what disappeared, batching the embedding calls and
 * recording history. That split is deliberate: the CSV importer already learned
 * these lessons the hard way, and a second source type should not have to
 * relearn them.
 */
@Injectable()
export class SourceSyncService {
  private readonly logger = new Logger(SourceSyncService.name);
  private readonly adapters = new Map<string, SourceAdapter>();

  constructor(
    @InjectRepository(KbDocument) private readonly docRepo: Repository<KbDocument>,
    @InjectRepository(KnowledgeSource) private readonly sourceRepo: Repository<KnowledgeSource>,
    private readonly revisions: KbRevisionService,
    board: BoardAdapter,
  ) {
    this.register(board);
  }

  private register(adapter: SourceAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  /** Source types that can actually ingest today. */
  supportedTypes(): string[] {
    return [...this.adapters.keys()];
  }

  adapterFor(type: string): SourceAdapter | null {
    return this.adapters.get(type) ?? null;
  }

  /**
   * Pull a source and reconcile its documents.
   *
   * Returns the ids that need embedding rather than embedding them here: the
   * caller batches, because one call per document is the shape that fails under
   * rate limiting (PR #95).
   */
  async sync(
    tenantId: number,
    source: KnowledgeSource,
    actorUserId: number | null,
  ): Promise<{ result: SyncResult; touchedIds: number[] }> {
    const adapter = this.adapterFor(source.type);
    if (!adapter) {
      // Loudly, not silently: registering a source of an unimplemented type and
      // seeing nothing happen is the confusion this whole plan started from.
      this.logger.warn(`sync requested for unimplemented source type "${source.type}"`);
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }

    const items = await adapter.fetchAll(tenantId, source);
    const result: SyncResult = {
      fetched: items.length,
      created: 0,
      updated: 0,
      skipped: 0,
      hidden: 0,
      failed: 0,
    };
    const touchedIds: number[] = [];

    const existing = await this.docRepo.find({ where: { tenantId, sourceId: source.id } });
    const byKey = new Map(existing.filter((d) => d.externalKey).map((d) => [d.externalKey!, d]));
    const seen = new Set<string>();

    for (const item of items) {
      if (!item.externalKey || !item.title) {
        result.failed += 1;
        continue;
      }
      if (seen.has(item.externalKey)) {
        this.logger.warn(`source ${source.id} returned duplicate key ${item.externalKey}`);
        result.failed += 1;
        continue;
      }
      seen.add(item.externalKey);

      const found = byKey.get(item.externalKey);
      if (!found) {
        const saved = await this.docRepo.save(
          this.docRepo.create({
            tenantId,
            sourceId: source.id,
            docGroup: DOC_GROUP.COUNSEL,
            externalKey: item.externalKey,
            source: 'knowledge_store',
            title: item.title,
            category: item.category,
            content: item.content,
            sourceUrl: item.sourceUrl,
            active: 1,
            status: 'pending',
            embeddingRef: null,
          }),
        );
        await this.revisions.record(tenantId, saved, null, REVISION_KIND.CREATE, actorUserId);
        touchedIds.push(Number(saved.id));
        result.created += 1;
        continue;
      }

      const unchanged =
        found.title === item.title &&
        (found.content ?? '') === item.content &&
        (found.category ?? null) === item.category &&
        (found.sourceUrl ?? null) === item.sourceUrl &&
        found.active === 1;
      if (unchanged) {
        // Unchanged is not the same as searchable: a document left at 'pending'
        // by an earlier partial run would otherwise be skipped forever and stay
        // invisible to retrieval (learned from the CSV import, PR #104).
        if (found.status !== 'embedded') touchedIds.push(Number(found.id));
        result.skipped += 1;
        continue;
      }

      const before = { ...found } as KbDocument;
      found.title = item.title;
      found.category = item.category;
      found.content = item.content;
      found.sourceUrl = item.sourceUrl;
      found.active = 1; // a previously hidden item that came back is live again
      found.status = 'pending';
      const saved = await this.docRepo.save(found);
      await this.revisions.record(tenantId, saved, before, REVISION_KIND.UPDATE, actorUserId);
      touchedIds.push(Number(saved.id));
      result.updated += 1;
    }

    result.hidden = await this.hideMissing(tenantId, existing, seen, actorUserId);
    return { result, touchedIds };
  }

  /**
   * Documents whose source item is gone are hidden, not deleted (D7).
   *
   * Hiding is reversible and is what retrieval already honours; a hard delete
   * would destroy the revision history's subject and could not be undone if the
   * disappearance turned out to be an upstream glitch.
   */
  private async hideMissing(
    tenantId: number,
    existing: KbDocument[],
    seen: Set<string>,
    actorUserId: number | null,
  ): Promise<number> {
    let hidden = 0;
    for (const doc of existing) {
      if (!doc.externalKey || seen.has(doc.externalKey) || doc.active !== 1) continue;
      const before = { ...doc } as KbDocument;
      doc.active = 0;
      const saved = await this.docRepo.save(doc);
      await this.revisions.record(tenantId, saved, before, REVISION_KIND.UPDATE, actorUserId);
      hidden += 1;
    }
    return hidden;
  }

  /** Persist the outcome so the console can show when a source last ran. */
  async recordSyncState(source: KnowledgeSource, status: string, result: SyncResult): Promise<void> {
    source.lastSyncAt = new Date();
    source.lastSyncStatus = status;
    source.lastSyncResult = { ...result };
    await this.sourceRepo.save(source);
  }
}
