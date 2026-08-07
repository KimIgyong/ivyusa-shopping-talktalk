import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { PRODUCT_STATUS, ProductCache } from './entity/product-cache.entity';
import { ProductSave } from '../save/entity/product-save.entity';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Normalized tag list of a catalog row (comma-joined column → trimmed, lowercased). */
function splitTags(p: ProductCache): string[] {
  return (p.tags ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Customer-facing catalog reads (PLN-260807-IvyusaApp-Revamp F1, A-3).
 * All reads are tenant-scoped; a session without a tenant sees an empty catalog
 * rather than someone else's (fail-closed, POL multitenancy).
 */
@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(ProductCache) private readonly productRepo: Repository<ProductCache>,
    @InjectRepository(ProductSave) private readonly saveRepo: Repository<ProductSave>,
  ) {}

  /**
   * Active products, newest first. `q` matches title OR tags (LIKE contains);
   * `category` is an exact match on the storefront product_type.
   */
  async list(
    tenantId: number | null,
    q: string | undefined,
    category: string | undefined,
    page: number,
    size: number,
  ): Promise<[ProductCache[], number]> {
    if (tenantId == null) return [[], 0];
    const base: Record<string, unknown> = { tenantId, status: PRODUCT_STATUS.ACTIVE };
    if (category) base.category = category;
    const where = q ? [{ ...base, title: Like(`%${q}%`) }, { ...base, tags: Like(`%${q}%`) }] : base;
    return this.productRepo.findAndCount({
      where,
      order: { publishedAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
  }

  /** Distinct non-empty categories of the tenant's active products (filter dropdown). */
  async categories(tenantId: number | null): Promise<string[]> {
    if (tenantId == null) return [];
    const rows = await this.productRepo.find({
      where: { tenantId, status: PRODUCT_STATUS.ACTIVE },
      select: ['category'],
    });
    const set = new Set<string>();
    for (const row of rows) {
      if (row.category && row.category.trim() !== '') set.add(row.category);
    }
    return [...set].sort();
  }

  /**
   * Deterministic recommendations v1 (PLN-260807-IvyusaApp-Revamp F3, A-10 —
   * the home feed "AI 추천" rail; LLM personalization is P2).
   *
   * Signal = the categories + tags of products the customer saved (product_saves
   * joined to the tenant catalog by handle). Order items are deliberately NOT
   * mined: order_items carries only a Shopify product_id/title — no handle and no
   * category — so deriving a category from orders is not cheap here (A-10 says
   * skip rather than overreach).
   *
   * Scoring over the tenant's active products, excluding already-saved handles:
   * shared category = 2, any tag intersection = +1; order score DESC then
   * publishedAt DESC (the candidate query is newest-first and the sort is
   * stable, so zero-score rows fill the remainder as "newest actives").
   * Anonymous or zero-signal → newest actives.
   */
  async recommendations(
    tenantId: number | null,
    customerId: number | null,
    size: number,
  ): Promise<ProductCache[]> {
    if (tenantId == null) return [];
    if (customerId == null) return this.newestActive(tenantId, size);

    const saves = await this.saveRepo.find({ where: { customerId } });
    if (saves.length === 0) return this.newestActive(tenantId, size);

    const savedHandles = new Set(saves.map((s) => s.productHandle));
    const savedProducts = await this.productRepo.find({
      where: { tenantId, handle: In([...savedHandles]) },
    });
    const categories = new Set(
      savedProducts.map((p) => p.category).filter((c): c is string => !!c && c.trim() !== ''),
    );
    const tags = new Set(savedProducts.flatMap(splitTags));

    const candidates = await this.productRepo.find({
      where: { tenantId, status: PRODUCT_STATUS.ACTIVE },
      order: { publishedAt: 'DESC', id: 'DESC' },
    });
    const scored = candidates
      .filter((p) => !savedHandles.has(p.handle))
      .map((p) => ({
        p,
        score:
          (p.category && categories.has(p.category) ? 2 : 0) +
          (splitTags(p).some((t) => tags.has(t)) ? 1 : 0),
      }));
    // Array#sort is stable: equal scores keep the newest-first candidate order.
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, size).map((s) => s.p);
  }

  /** Cold-start / anonymous fallback: the tenant's newest active products. */
  private async newestActive(tenantId: number, size: number): Promise<ProductCache[]> {
    return this.productRepo.find({
      where: { tenantId, status: PRODUCT_STATUS.ACTIVE },
      order: { publishedAt: 'DESC', id: 'DESC' },
      take: size,
    });
  }

  /** One product by handle — archived rows stay reachable (deep links from old pushes). */
  async detail(tenantId: number | null, handle: string): Promise<ProductCache> {
    const product =
      tenantId == null ? null : await this.productRepo.findOne({ where: { tenantId, handle } });
    if (!product) {
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    return product;
  }
}
