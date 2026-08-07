import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DOC_GROUP, KbDocument } from './entity/kb-document.entity';
import { ProductCache, PRODUCT_STATUS } from '../product/entity/product-cache.entity';
import { KbRevisionService } from './kb-revision.service';
import { REVISION_KIND } from './entity/kb-document-revision.entity';

/** `source` value marking a document this converter owns (PLN-260807 P1). */
export const CATALOG_SOURCE = 'product_catalog';

/**
 * Words of the normalized title that identify a variant family.
 *
 * Chosen by measuring the live catalogue (2,275 products): splitting on the
 * en dash caught only 41 families, a 28-character prefix is hostage to title
 * length, and five words folds 1,038 rows into 256 families — 41 shades of one
 * nail polish, 30 designs of one press-on set — with no false merges in the
 * largest groups (REQ-260807 §1).
 */
const FAMILY_KEY_WORDS = 5;

/** Variant names listed in the body before it collapses to "and N more". */
const MAX_LISTED_VARIANTS = 20;

/** Below this, a description carries nothing an answer could be grounded in. */
const MIN_USEFUL_DESCRIPTION = 80;

export interface CatalogSyncCounts {
  /** Catalogue rows examined. */
  scanned: number;
  /** Variant families the rows collapsed into. */
  families: number;
  /** Rows absorbed into a representative (scanned − families). */
  absorbed: number;
  created: number;
  /** Body rewritten from the catalogue. */
  updated: number;
  /** Curated document left intact; link/active refreshed only. */
  curatedKept: number;
  /** Already identical — nothing written. */
  unchanged: number;
  /** No usable description and no tags. */
  held: number;
}

export interface CatalogSyncPreview extends CatalogSyncCounts {
  /** Products that would be held back, so the console can show what is missing. */
  heldSamples: Array<{ handle: string; title: string }>;
  /** Largest families, so a wrong merge is visible before anything is written. */
  familySamples: Array<{ representative: string; absorbed: number; variants: string[] }>;
}

interface Family {
  key: string;
  representative: ProductCache;
  members: ProductCache[];
}

/**
 * Catalogue → product knowledge (PLN-260807 P1).
 *
 * `products_cache` is display data; retrieval answers out of `kb_documents`.
 * This converter is the bridge, and it exists because coverage was the whole
 * gap: 144 of 2,275 products were reachable by RAG, so a shopper asking for
 * something in the other 93.7% got "we don't carry that" for a product sitting
 * on the storefront (REQ-260807 §0).
 *
 * Deliberately NOT automatic. Embedding calls are rate-limited, and a catalogue
 * refresh that silently rewrites the knowledge base gives nobody a chance to
 * look at it first — the console previews, a human approves, then it runs.
 */
@Injectable()
export class CatalogSyncService {
  private readonly logger = new Logger(CatalogSyncService.name);

  constructor(
    @InjectRepository(KbDocument) private readonly docRepo: Repository<KbDocument>,
    @InjectRepository(ProductCache) private readonly productRepo: Repository<ProductCache>,
    private readonly revisions: KbRevisionService,
  ) {}

  /** Dry run — reports what `sync` would do and writes nothing. */
  async preview(tenantId: number): Promise<CatalogSyncPreview> {
    const byKey = await this.existingByKey(tenantId);
    const { families, held, products } = await this.plan(tenantId, this.curatedHandles(byKey));

    const counts = this.emptyCounts(products.length, families.length, held.length);
    for (const family of families) {
      const doc = this.buildDoc(family);
      const found = byKey.get(family.representative.handle);
      if (!found) counts.created += 1;
      else if (!this.ownsDocument(found)) counts.curatedKept += 1;
      else if (this.isUnchanged(found, doc)) counts.unchanged += 1;
      else counts.updated += 1;
    }

    return {
      ...counts,
      heldSamples: held.slice(0, 20).map((p) => ({ handle: p.handle, title: p.title })),
      familySamples: [...families]
        .filter((f) => f.members.length > 1)
        .sort((a, b) => b.members.length - a.members.length)
        .slice(0, 10)
        .map((f) => ({
          representative: f.representative.title,
          absorbed: f.members.length - 1,
          variants: f.members
            .filter((m) => m.handle !== f.representative.handle)
            .slice(0, 5)
            .map((m) => m.title),
        })),
    };
  }

  /**
   * Convert the catalogue into product documents.
   *
   * Returns the ids of documents that need embedding — the caller batches them
   * (`KnowledgeService.embedDocuments`). Embedding per document here would
   * issue one single-text call each, the shape the adapter does not retry and
   * the one that failed wholesale under rate limiting (PR #95).
   */
  async sync(
    tenantId: number,
    actorUserId: number,
  ): Promise<{ counts: CatalogSyncCounts; touchedIds: number[] }> {
    const byKey = await this.existingByKey(tenantId);
    const { families, held, products } = await this.plan(tenantId, this.curatedHandles(byKey));
    const counts = this.emptyCounts(products.length, families.length, held.length);
    const touchedIds: number[] = [];

    for (const family of families) {
      const doc = this.buildDoc(family);
      const found = byKey.get(family.representative.handle);

      if (!found) {
        const saved = await this.docRepo.save(
          this.docRepo.create({
            tenantId,
            docGroup: DOC_GROUP.PRODUCT,
            externalKey: family.representative.handle,
            source: CATALOG_SOURCE,
            status: 'pending',
            embeddingRef: null,
            ...doc,
          }),
        );
        await this.revisions.record(tenantId, saved, null, REVISION_KIND.CREATE, actorUserId);
        touchedIds.push(Number(saved.id));
        counts.created += 1;
        continue;
      }

      // A document somebody wrote or edited by hand outranks generated text:
      // the curated set averages 1,894 characters and carries usage steps the
      // storefront never published. Only the facts this converter is the
      // authority on — where the product lives, whether it is still sold —
      // are refreshed.
      if (!this.ownsDocument(found)) {
        const linkChanged = (found.sourceUrl ?? null) !== doc.sourceUrl;
        const activeChanged = found.active !== doc.active;
        if (linkChanged || activeChanged) {
          const before = { ...found } as KbDocument;
          found.sourceUrl = doc.sourceUrl;
          found.active = doc.active;
          const saved = await this.docRepo.save(found);
          await this.revisions.record(tenantId, saved, before, REVISION_KIND.UPDATE, actorUserId);
        }
        counts.curatedKept += 1;
        continue;
      }

      if (this.isUnchanged(found, doc)) {
        // Unchanged content is not the same as "already searchable": a document
        // from a run that died before embedding would otherwise stay invisible
        // to retrieval forever.
        if (found.status !== 'embedded') touchedIds.push(Number(found.id));
        counts.unchanged += 1;
        continue;
      }

      const before = { ...found } as KbDocument;
      Object.assign(found, doc, { status: 'pending' });
      const saved = await this.docRepo.save(found);
      await this.revisions.record(tenantId, saved, before, REVISION_KIND.UPDATE, actorUserId);
      touchedIds.push(Number(saved.id));
      counts.updated += 1;
    }

    this.logger.log(
      `catalog sync tenant ${tenantId}: ${counts.scanned} rows → ${counts.families} families ` +
        `(created ${counts.created}, updated ${counts.updated}, curated kept ${counts.curatedKept}, ` +
        `unchanged ${counts.unchanged}, held ${counts.held})`,
    );
    return { counts, touchedIds };
  }

  /** Group the catalogue into families and set aside rows with nothing to say. */
  private async plan(
    tenantId: number,
    curatedHandles: Set<string>,
  ): Promise<{ families: Family[]; held: ProductCache[]; products: ProductCache[] }> {
    const products = await this.productRepo.find({ where: { tenantId } });
    const held: ProductCache[] = [];
    const groups = new Map<string, ProductCache[]>();

    for (const p of products) {
      if (!this.hasSomethingToSay(p)) {
        held.push(p);
        continue;
      }
      const key = this.familyKey(p.title);
      const bucket = groups.get(key);
      if (bucket) bucket.push(p);
      else groups.set(key, [p]);
    }

    const families = [...groups.entries()].map(([key, members]) => ({
      key,
      members,
      representative: this.pickRepresentative(members, curatedHandles),
    }));
    return { families, held, products };
  }

  /**
   * A member that already has a hand-written document wins outright, then the
   * longest description, then handle order so a re-run elects the same one.
   *
   * The curated rule is not cosmetic. Elect a different shade of the same
   * polish and the family gets a NEW generated document while the curated one
   * — the version carrying usage steps — sits beside it covering the same
   * product, and retrieval now has two documents competing for the same
   * question. Measured on staging: 14 of 144 curated documents were not the
   * elected representative of their family.
   */
  private pickRepresentative(members: ProductCache[], curatedHandles: Set<string>): ProductCache {
    return [...members].sort((a, b) => {
      const curated = Number(curatedHandles.has(b.handle)) - Number(curatedHandles.has(a.handle));
      if (curated !== 0) return curated;
      const diff = (b.description?.length ?? 0) - (a.description?.length ?? 0);
      return diff !== 0 ? diff : a.handle.localeCompare(b.handle);
    })[0];
  }

  private familyKey(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9가-힣\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, FAMILY_KEY_WORDS)
      .join(' ');
  }

  private hasSomethingToSay(p: ProductCache): boolean {
    const description = (p.description ?? '').trim();
    return description.length >= MIN_USEFUL_DESCRIPTION || !!(p.tags ?? '').trim();
  }

  /**
   * The document an answer is grounded in.
   *
   * Price is absent by the same rule the CSV importer follows: a price frozen
   * into a vector index goes stale silently, and a wrong price in a customer
   * answer is a dispute, not a typo (PLN-260804 D4). SKU is absent too — it
   * repeats across products and is blank on others, so it identifies nothing.
   */
  private buildDoc(family: Family): Pick<
    KbDocument,
    'title' | 'category' | 'content' | 'sourceUrl' | 'active'
  > {
    const rep = family.representative;
    const parts = [rep.title];
    if (rep.description?.trim()) parts.push(`\n${rep.description.trim()}`);
    if (rep.tags?.trim()) parts.push(`\nTags: ${rep.tags.trim()}`);

    const variants = family.members
      .filter((m) => m.handle !== rep.handle)
      .map((m) => m.title)
      .sort();
    if (variants.length) {
      const listed = variants.slice(0, MAX_LISTED_VARIANTS).join(', ');
      const rest = variants.length - MAX_LISTED_VARIANTS;
      parts.push(`\nVariants: ${listed}${rest > 0 ? ` and ${rest} more` : ''}`);
    }

    return {
      title: rep.title,
      // Brand, not product_type: vendor is filled on every row while
      // product_type is missing on 899 of 2,275 (REQ-260807 §3-6).
      category: rep.vendor ?? null,
      content: parts.join('\n'),
      sourceUrl: rep.productUrl ?? null,
      // A family stays recommendable while any of its variants is still sold.
      active: family.members.some((m) => m.status === PRODUCT_STATUS.ACTIVE) ? 1 : 0,
    };
  }

  private async existingByKey(tenantId: number): Promise<Map<string, KbDocument>> {
    const docs = await this.docRepo.find({ where: { tenantId, docGroup: DOC_GROUP.PRODUCT } });
    return new Map(docs.filter((d) => d.externalKey).map((d) => [d.externalKey!, d]));
  }

  /** Handles whose document was written by a human, not by this converter. */
  private curatedHandles(byKey: Map<string, KbDocument>): Set<string> {
    return new Set([...byKey.values()].filter((d) => !this.ownsDocument(d)).map((d) => d.externalKey!));
  }

  /** Whether this converter may rewrite the document's body. */
  private ownsDocument(doc: KbDocument): boolean {
    return doc.source === CATALOG_SOURCE;
  }

  private isUnchanged(doc: KbDocument, next: ReturnType<CatalogSyncService['buildDoc']>): boolean {
    return (
      doc.title === next.title &&
      (doc.category ?? null) === next.category &&
      (doc.content ?? '') === next.content &&
      (doc.sourceUrl ?? null) === next.sourceUrl &&
      doc.active === next.active
    );
  }

  private emptyCounts(scanned: number, families: number, held: number): CatalogSyncCounts {
    return {
      scanned,
      families,
      // Held rows never entered a family, so they are not "absorbed" by one.
      absorbed: scanned - held - families,
      created: 0,
      updated: 0,
      curatedKept: 0,
      unchanged: 0,
      held,
    };
  }
}
