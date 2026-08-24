import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DOC_GROUP, KbDocument } from './entity/kb-document.entity';
import { ProductCache, PRODUCT_STATUS } from '../product/entity/product-cache.entity';
import { KbRevisionService } from './kb-revision.service';
import { REVISION_KIND } from './entity/kb-document-revision.entity';
import { classifyUsageType, parseKeywords, usageGuideKey } from './usage-guide.types';
import { UsageTypeService } from './usage-type.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Category all usage guides file under, so the console groups them in one place. */
export const USAGE_GUIDE_CATEGORY = 'How to Use';

export interface UsageGuideSummary {
  /** Row id of the type, so the console can edit or reorder it. */
  id: string;
  key: string;
  label: string;
  /** Turned-off types still list, so an existing guide stays reachable. */
  active: boolean;
  /** Active catalogue products this guide would serve. */
  productCount: number;
  documentId: string | null;
  title: string | null;
  updatedAt: string | null;
}

/**
 * Usage guides per product type (PLN-260807 P2).
 *
 * They live in the product group like any other product document, so the same
 * group preference applies and retrieval can cite a guide next to the product
 * it explains — RAG passes six documents to the model, which is why the steps
 * never needed to be duplicated into all 329 press-on nail documents.
 *
 * Bodies are written by whoever knows the product, not generated. Inventing
 * application steps for cosmetics is a safety problem, not a content gap.
 */
@Injectable()
export class UsageGuideService {
  private readonly logger = new Logger(UsageGuideService.name);

  constructor(
    @InjectRepository(KbDocument) private readonly docRepo: Repository<KbDocument>,
    @InjectRepository(ProductCache) private readonly productRepo: Repository<ProductCache>,
    private readonly revisions: KbRevisionService,
    private readonly types: UsageTypeService,
  ) {}

  /**
   * Every type with how many products it covers and whether it has been
   * written. The unwritten ones are the point: a gap nobody can see is a gap
   * nobody fills.
   */
  async list(tenantId: number): Promise<UsageGuideSummary[]> {
    const rows = await this.types.list(tenantId);
    const matchers = rows
      .filter((r) => r.active === 1)
      .map((r) => ({ key: r.key, keywords: parseKeywords(r.keywords) }));

    const products = await this.productRepo.find({
      where: { tenantId, status: PRODUCT_STATUS.ACTIVE },
      select: ['handle', 'title', 'category', 'tags'],
    });
    const counts = new Map<string, number>();
    for (const p of products) {
      const key = classifyUsageType(p, matchers);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const docs = await this.docRepo.find({
      where: { tenantId, docGroup: DOC_GROUP.PRODUCT, category: USAGE_GUIDE_CATEGORY },
    });
    const byKey = new Map(docs.filter((d) => d.externalKey).map((d) => [d.externalKey!, d]));

    return rows.map((row) => {
      const key = row.key;
      const doc = byKey.get(usageGuideKey(key));
      return {
        id: String(row.id),
        key,
        label: row.label,
        active: row.active === 1,
        productCount: counts.get(key) ?? 0,
        documentId: doc ? String(doc.id) : null,
        title: doc?.title ?? null,
        updatedAt: doc?.updatedAt ? doc.updatedAt.toISOString() : null,
      };
    });
  }

  /**
   * Create or rewrite one guide. Returns the document so the caller can embed
   * it — a guide that is not indexed answers nothing.
   */
  async upsert(
    tenantId: number,
    typeKey: string,
    input: { title: string; content: string },
    actorUserId: number,
  ): Promise<KbDocument> {
    const known = await this.types.list(tenantId);
    if (!known.some((t) => t.key === typeKey)) {
      // A guide may only be written for a type this tenant actually has —
      // otherwise a stale console tab could file one under another shop's
      // vocabulary, where nothing would ever cite it.
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
    const externalKey = usageGuideKey(typeKey);
    const found = await this.docRepo.findOne({
      where: { tenantId, docGroup: DOC_GROUP.PRODUCT, externalKey },
    });

    if (!found) {
      const saved = await this.docRepo.save(
        this.docRepo.create({
          tenantId,
          docGroup: DOC_GROUP.PRODUCT,
          externalKey,
          category: USAGE_GUIDE_CATEGORY,
          // Not the catalogue converter's source: a human wrote this, and the
          // converter must never treat it as its own to overwrite.
          source: 'knowledge_store',
          title: input.title,
          content: input.content,
          active: 1,
          status: 'pending',
          embeddingRef: null,
        }),
      );
      await this.revisions.record(tenantId, saved, null, REVISION_KIND.CREATE, actorUserId);
      this.logger.log(`usage guide created: ${typeKey} (tenant ${tenantId})`);
      return saved;
    }

    const before = { ...found } as KbDocument;
    found.title = input.title;
    found.content = input.content;
    found.status = 'pending';
    found.active = 1;
    const saved = await this.docRepo.save(found);
    await this.revisions.record(tenantId, saved, before, REVISION_KIND.UPDATE, actorUserId);
    this.logger.log(`usage guide updated: ${typeKey} (tenant ${tenantId})`);
    return saved;
  }
}
