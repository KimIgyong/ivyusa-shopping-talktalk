import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsageType } from './entity/usage-type.entity';
import { ProductCache, PRODUCT_STATUS } from '../product/entity/product-cache.entity';
import {
  DEFAULT_USAGE_TYPES,
  UsageTypeMatcher,
  classifyUsageType,
  parseKeywords,
  serializeKeywords,
  slugifyTypeKey,
} from './usage-guide.types';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** How many example titles a keyword preview shows. */
const PREVIEW_SAMPLE = 5;

export interface UsageTypePreview {
  matched: number;
  samples: string[];
  /**
   * Products these keywords describe that a higher-ordered type already takes.
   *
   * Without this, "0 products" is ambiguous in the one case the operator is
   * most likely to hit: typing terms that an existing type already covers. The
   * count would be honest and the conclusion — "my keywords are wrong" —
   * would be wrong.
   */
  takenByOthers: number;
  /** The type doing the taking, when it is mostly one of them. */
  takenBy: string | null;
}

/**
 * The tenant's usage-guide types (PLN-260824 A축).
 *
 * Ordering is data, not presentation: `classifyUsageType` takes the first
 * match, so a narrow type has to be able to sit above the broad one that
 * contains it. Every read here is ordered, and the console can reorder.
 */
@Injectable()
export class UsageTypeService {
  private readonly logger = new Logger(UsageTypeService.name);

  constructor(
    @InjectRepository(UsageType) private readonly repo: Repository<UsageType>,
    @InjectRepository(ProductCache) private readonly productRepo: Repository<ProductCache>,
  ) {}

  /** All of a tenant's types, in match order. Inactive ones included. */
  async list(tenantId: number): Promise<UsageType[]> {
    return this.repo.find({ where: { tenantId }, order: { sortOrder: 'ASC', id: 'ASC' } });
  }

  /** Match order for the active types only — what classification actually uses. */
  async matchersFor(tenantId: number): Promise<UsageTypeMatcher[]> {
    const rows = await this.list(tenantId);
    return rows
      .filter((r) => r.active === 1)
      .map((r) => ({ key: r.key, keywords: parseKeywords(r.keywords) }));
  }

  async create(
    tenantId: number,
    input: { label: string; keywords?: string[] },
  ): Promise<UsageType> {
    const label = input.label.trim();
    if (!label) throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);

    const existing = await this.list(tenantId);
    const key = slugifyTypeKey(label, existing.map((t) => t.key));
    const saved = await this.repo.save(
      this.repo.create({
        tenantId,
        key,
        label,
        keywords: serializeKeywords(input.keywords ?? []),
        // New types go last: inserting above an existing rule would change how
        // products already classify without anyone asking for that.
        sortOrder: existing.length ? Math.max(...existing.map((t) => t.sortOrder)) + 10 : 10,
        active: 1,
      }),
    );
    this.logger.log(`usage type created: ${key} (tenant ${tenantId})`);
    return saved;
  }

  /**
   * Label, keywords and active flag. The key is not editable — it is half of
   * the guide document's `external_key`, so changing it would orphan whatever
   * has already been written for this type.
   */
  async update(
    tenantId: number,
    id: number,
    input: { label?: string; keywords?: string[]; active?: boolean },
  ): Promise<UsageType> {
    const row = await this.find(tenantId, id);
    if (input.label !== undefined) {
      const label = input.label.trim();
      if (!label) throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
      row.label = label;
    }
    if (input.keywords !== undefined) row.keywords = serializeKeywords(input.keywords);
    if (input.active !== undefined) row.active = input.active ? 1 : 0;
    return this.repo.save(row);
  }

  /** Whole-list reorder: the caller sends the ids in the order it wants them. */
  async reorder(tenantId: number, ids: number[]): Promise<void> {
    const rows = await this.list(tenantId);
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    let order = 10;
    for (const id of ids) {
      const row = byId.get(String(id));
      if (!row) continue;
      row.sortOrder = order;
      order += 10;
      await this.repo.save(row);
    }
  }

  /**
   * How many of this tenant's products a keyword set would claim, with a few
   * titles as evidence.
   *
   * This exists because a wrong keyword fails silently — it simply matches
   * nothing, and "0 products" looks the same as "this catalogue has none of
   * those". Showing the count while the operator is still typing is the only
   * place that distinction is cheap to make (PLN D2).
   *
   * Types above this one still win, so the preview subtracts what they claim:
   * a count that ignored ordering would promise products this type will never
   * actually receive.
   */
  async preview(
    tenantId: number,
    keywords: string[],
    opts: { excludeId?: number } = {},
  ): Promise<UsageTypePreview> {
    const own: UsageTypeMatcher = {
      key: '__preview__',
      keywords: keywords.map((k) => k.trim().toLowerCase()).filter(Boolean),
    };
    if (!own.keywords.length) return { matched: 0, samples: [], takenByOthers: 0, takenBy: null };

    const rows = await this.list(tenantId);
    const target = opts.excludeId ? rows.find((r) => String(r.id) === String(opts.excludeId)) : null;
    const ahead = rows
      .filter((r) => r.active === 1)
      .filter((r) => String(r.id) !== String(opts.excludeId ?? ''))
      // Only the types that would be tested first can steal a product.
      .filter((r) => (target ? r.sortOrder < target.sortOrder : true))
      .map((r) => ({ key: r.key, keywords: parseKeywords(r.keywords) }));

    const products = await this.productRepo.find({
      where: { tenantId, status: PRODUCT_STATUS.ACTIVE },
      select: ['title', 'category', 'tags'],
    });

    const samples: string[] = [];
    const stolenBy = new Map<string, number>();
    let matched = 0;
    for (const p of products) {
      // Would these keywords describe it at all, ignoring everyone else?
      if (!classifyUsageType(p, [own])) continue;
      const winner = classifyUsageType(p, [...ahead, own]);
      if (winner === own.key) {
        matched += 1;
        if (samples.length < PREVIEW_SAMPLE) samples.push(p.title);
      } else if (winner) {
        stolenBy.set(winner, (stolenBy.get(winner) ?? 0) + 1);
      }
    }

    const takenByOthers = [...stolenBy.values()].reduce((a, b) => a + b, 0);
    const top = [...stolenBy.entries()].sort((a, b) => b[1] - a[1])[0];
    const label = top ? (rows.find((r) => r.key === top[0])?.label ?? top[0]) : null;
    return { matched, samples, takenByOthers, takenBy: label };
  }

  /**
   * Give a new tenant the neutral starter set (PLN D4).
   *
   * No-ops when the tenant already has types, so it is safe to call from every
   * creation path — and it is called from every creation path, because seeding
   * only one of them leaves tenants whose console opens on an empty list.
   */
  async seedDefaults(tenantId: number): Promise<void> {
    const existing = await this.repo.count({ where: { tenantId } });
    if (existing > 0) return;
    let order = 10;
    for (const t of DEFAULT_USAGE_TYPES) {
      await this.repo.save(
        this.repo.create({
          tenantId,
          key: t.key,
          label: t.label,
          keywords: null,
          sortOrder: order,
          active: 1,
        }),
      );
      order += 10;
    }
    this.logger.log(`seeded ${DEFAULT_USAGE_TYPES.length} usage types for tenant ${tenantId}`);
  }

  private async find(tenantId: number, id: number): Promise<UsageType> {
    const row = await this.repo.findOne({ where: { id, tenantId } });
    if (!row) throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    return row;
  }
}
