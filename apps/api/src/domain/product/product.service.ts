import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { PRODUCT_STATUS, ProductCache } from './entity/product-cache.entity';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/**
 * Customer-facing catalog reads (PLN-260807-IvyusaApp-Revamp F1, A-3).
 * All reads are tenant-scoped; a session without a tenant sees an empty catalog
 * rather than someone else's (fail-closed, POL multitenancy).
 */
@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(ProductCache) private readonly productRepo: Repository<ProductCache>,
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
