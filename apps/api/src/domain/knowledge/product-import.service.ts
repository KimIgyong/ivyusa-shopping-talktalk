import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DOC_GROUP, KbDocument } from './entity/kb-document.entity';
import { KbRevisionService } from './kb-revision.service';
import { REVISION_KIND } from './entity/kb-document-revision.entity';
import { parseCsvRecords } from './csv.util';
import { PRODUCT_STATUS, ProductCache } from '../product/entity/product-cache.entity';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Columns the importer cannot proceed without. */
const REQUIRED_COLUMNS = ['Product Name', 'Handle', 'Detail'] as const;
/** Refuse absurd files early rather than after parsing megabytes. */
const MAX_ROWS = 5_000;

export interface ProductImportResult {
  parsed: number;
  created: number;
  updated: number;
  skipped: number;
  invalid: number;
  errors: Array<{ row: number; reason: string }>;
}

/**
 * Product catalogue import (PLN-260804 P3).
 *
 * Rows become ProductInfo documents keyed by the Shopify `Handle`. `Handle` and
 * not `SKU`: in the supplied export SKU is blank on 7 of 144 rows and duplicated
 * on 8 more, so keying on it would have different products overwrite each other
 * (REQ-260804 §2-1).
 *
 * Embedding is NOT done here — rows land as `pending` and the caller embeds them
 * in batches. Creating 144 documents one at a time would issue 144 single-text
 * embedding calls, which the adapter deliberately does not retry, and that is
 * exactly the shape that failed under rate limiting (PR #95).
 */
@Injectable()
export class ProductImportService {
  private readonly logger = new Logger(ProductImportService.name);

  constructor(
    @InjectRepository(KbDocument) private readonly docRepo: Repository<KbDocument>,
    private readonly revisions: KbRevisionService,
    @InjectRepository(ProductCache) private readonly productRepo: Repository<ProductCache>,
  ) {}

  async importCsv(
    tenantId: number,
    csv: string,
    actorUserId: number,
  ): Promise<{ result: ProductImportResult; touchedIds: number[] }> {
    const { headers, records } = parseCsvRecords(csv);
    const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
    if (missing.length > 0) {
      this.logger.warn(`product import rejected: missing columns ${missing.join(', ')}`);
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
    if (records.length > MAX_ROWS) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }

    const result: ProductImportResult = {
      parsed: records.length,
      created: 0,
      updated: 0,
      skipped: 0,
      invalid: 0,
      errors: [],
    };

    // Existing products for this tenant, keyed for an in-memory upsert decision.
    const existing = await this.docRepo.find({
      where: { tenantId, docGroup: DOC_GROUP.PRODUCT },
    });
    const byKey = new Map(existing.filter((d) => d.externalKey).map((d) => [d.externalKey!, d]));

    // Catalog bridge (PLN-260807 F1): active only when the file carries the
    // OPTIONAL display columns — preloaded once so 5k rows don't issue 5k lookups.
    const hasCatalogColumns = headers.includes('Price(USD)') || headers.includes('Image URL');
    const catalogByHandle = hasCatalogColumns
      ? new Map((await this.productRepo.find({ where: { tenantId } })).map((p) => [p.handle, p]))
      : null;

    const touchedIds: number[] = [];
    const seenKeys = new Set<string>();

    for (const [i, rec] of records.entries()) {
      const rowNo = i + 2; // 1-based, plus the header line
      const handle = rec['Handle'];
      const name = rec['Product Name'];
      if (!handle || !name) {
        result.invalid += 1;
        result.errors.push({ row: rowNo, reason: !handle ? 'Handle is empty' : 'Product Name is empty' });
        continue;
      }
      if (seenKeys.has(handle)) {
        // A duplicate Handle inside one file would make the last row win
        // silently; report it instead.
        result.invalid += 1;
        result.errors.push({ row: rowNo, reason: `duplicate Handle "${handle}" in this file` });
        continue;
      }
      seenKeys.add(handle);

      // Feed price/image into the display catalog (products_cache). Isolated:
      // a catalog hiccup must never fail the KB import it rides along with.
      if (catalogByHandle) {
        try {
          await this.bridgeCatalogRow(tenantId, handle, name, rec, catalogByHandle);
        } catch (e) {
          this.logger.warn(`catalog bridge failed for "${handle}": ${(e as Error).message}`);
        }
      }

      const content = this.buildBody(rec);
      const category = rec['Brand'] || rec['Category'] || null;
      const sourceUrl = rec['Product URL'] || null;
      const found = byKey.get(handle);

      if (!found) {
        const saved = await this.docRepo.save(
          this.docRepo.create({
            tenantId,
            docGroup: DOC_GROUP.PRODUCT,
            externalKey: handle,
            source: 'knowledge_store',
            title: name,
            category,
            content,
            sourceUrl,
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
        found.title === name &&
        (found.content ?? '') === content &&
        (found.category ?? null) === category &&
        (found.sourceUrl ?? null) === sourceUrl;
      if (unchanged) {
        // Re-importing an unchanged catalogue must not re-embed 144 documents
        // or fill the revision history with no-op entries — but a row that
        // exists and never got indexed (a partial earlier run) would otherwise
        // be skipped forever and stay invisible to retrieval. Content unchanged
        // is not the same as "already searchable".
        if (found.status !== 'embedded') touchedIds.push(Number(found.id));
        result.skipped += 1;
        continue;
      }

      const before = { ...found } as KbDocument;
      found.title = name;
      found.category = category;
      found.content = content;
      found.sourceUrl = sourceUrl;
      found.status = 'pending';
      const saved = await this.docRepo.save(found);
      await this.revisions.record(tenantId, saved, before, REVISION_KIND.UPDATE, actorUserId);
      touchedIds.push(Number(saved.id));
      result.updated += 1;
    }

    return { result, touchedIds };
  }

  /**
   * The document body an answer is grounded in.
   *
   * `Price(USD)` is deliberately absent: a price frozen into a vector index goes
   * stale silently, and a wrong price in a customer-facing answer is a dispute,
   * not a typo. Price questions are answered by pointing at the product URL
   * (PLN-260804 D4).
   */
  private buildBody(rec: Record<string, string>): string {
    const parts: string[] = [];
    if (rec['Brand']) parts.push(`Brand: ${rec['Brand']}`);
    if (rec['Product Name']) parts.push(rec['Product Name']);
    if (rec['Detail']) parts.push(`\n${rec['Detail']}`);
    if (rec['How to Use']) parts.push(`\nHow to use:\n${rec['How to Use']}`);
    if (rec['Tags']) parts.push(`\nTags: ${rec['Tags']}`);
    return parts.join('\n').trim();
  }

  /**
   * Upsert the display-catalog row (products_cache) from the OPTIONAL CSV
   * columns `Price(USD)` / `Image URL` (PLN-260807 F1). The storefront sync
   * remains the catalog's source of truth for everything else — this only sets
   * what the sync can also set, plus creates a minimal row when none exists yet
   * (title from `Product Name`, URL from `Product URL`, category from `Category`).
   */
  private async bridgeCatalogRow(
    tenantId: number,
    handle: string,
    name: string,
    rec: Record<string, string>,
    catalogByHandle: Map<string, ProductCache>,
  ): Promise<void> {
    const priceRaw = rec['Price(USD)'];
    const price = priceRaw && Number.isFinite(Number(priceRaw)) ? Number(priceRaw) : null;
    const imageRaw = rec['Image URL'];
    const imageUrl = imageRaw && /^https?:\/\//i.test(imageRaw) ? imageRaw.slice(0, 1024) : null;
    if (price == null && imageUrl == null) return;

    let row = catalogByHandle.get(handle);
    if (!row) {
      const url = rec['Product URL'];
      row = this.productRepo.create({
        tenantId,
        handle,
        title: name.slice(0, 255),
        productUrl: url && /^https?:\/\//i.test(url) ? url.slice(0, 1024) : null,
        category: rec['Category'] ? rec['Category'].slice(0, 128) : null,
        status: PRODUCT_STATUS.ACTIVE,
      });
    }
    if (price != null) row.price = price;
    if (imageUrl != null) row.imageUrl = imageUrl;
    const saved = await this.productRepo.save(row);
    catalogByHandle.set(handle, saved);
  }

  /** Products no longer present in the file — reported, never auto-deleted. */
  async staleProducts(tenantId: number, seenKeys: string[]): Promise<KbDocument[]> {
    const all = await this.docRepo.find({ where: { tenantId, docGroup: DOC_GROUP.PRODUCT } });
    const seen = new Set(seenKeys);
    return all.filter((d) => d.externalKey && !seen.has(d.externalKey));
  }

  /** Fetch the documents a caller should embed after an import. */
  async pendingByIds(tenantId: number, ids: number[]): Promise<KbDocument[]> {
    if (ids.length === 0) return [];
    return this.docRepo.find({ where: { tenantId, id: In(ids) } });
  }
}
