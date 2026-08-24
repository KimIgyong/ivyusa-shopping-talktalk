import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CATEGORY_ORIGIN, CategoryOrigin, KbCategory } from './entity/kb-category.entity';
import { KbDocument } from './entity/kb-document.entity';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

export interface KbCategorySummary {
  id: string;
  name: string;
  label: string | null;
  origin: string;
  hidden: boolean;
  /** Documents currently filed under this exact string. */
  documentCount: number;
}

/**
 * A tenant's document categories (PLN-260824 B축).
 *
 * The category itself is still the string in `kb_documents.category`; this
 * service owns the row that describes it. That split is deliberate — see the
 * entity for why a foreign key was rejected — and it has one consequence worth
 * stating: a document can hold a string with no row. Every writer therefore
 * goes through `ensure()`, and `list()` reports what documents actually carry
 * rather than what the table says exists, so drift shows up instead of hiding.
 */
@Injectable()
export class KbCategoryService {
  private readonly logger = new Logger(KbCategoryService.name);

  constructor(
    @InjectRepository(KbCategory) private readonly repo: Repository<KbCategory>,
    @InjectRepository(KbDocument) private readonly docRepo: Repository<KbDocument>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Every category this tenant has, with live document counts.
   *
   * Counts come from the documents, not from the table, so a row whose
   * documents were all moved reads 0 instead of claiming its old total.
   */
  async list(tenantId: number): Promise<KbCategorySummary[]> {
    const rows = await this.repo.find({
      where: { tenantId },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    const counts = await this.countsFor(tenantId);

    const summaries = rows.map((r) => ({
      id: String(r.id),
      name: r.name,
      label: r.label,
      origin: r.origin,
      hidden: r.hidden === 1,
      documentCount: counts.get(r.name) ?? 0,
    }));

    // A string that documents carry but no row describes — drift, or a category
    // written before this table existed. Surfacing it as a row the operator can
    // act on beats silently omitting documents from their own category list.
    const known = new Set(rows.map((r) => r.name));
    for (const [name, count] of counts) {
      if (known.has(name)) continue;
      summaries.push({
        id: `unregistered:${name}`,
        name,
        label: null,
        origin: CATEGORY_ORIGIN.MANUAL,
        hidden: false,
        documentCount: count,
      });
    }
    return summaries;
  }

  /**
   * Make sure a row exists for a category a document is about to carry.
   *
   * Called by every write path that invents a category — catalogue sync, source
   * ingestion, manual document edits. Cheap and idempotent by design: the
   * alternative is a table that slowly stops describing reality.
   */
  async ensure(tenantId: number, name: string, origin: CategoryOrigin): Promise<void> {
    const clean = name.trim();
    if (!clean) return;
    const existing = await this.repo.findOne({ where: { tenantId, name: clean } });
    if (existing) {
      // Promote, never demote. One catalogue document under a name is enough to
      // make a rename bounce back — sync rewrites the category of everything it
      // owns — so a name people also use by hand still has to be locked. The
      // reverse is not true: a hand-written document under a catalogue name
      // changes nothing about what sync will do.
      if (origin === CATEGORY_ORIGIN.CATALOG && existing.origin !== CATEGORY_ORIGIN.CATALOG) {
        existing.origin = CATEGORY_ORIGIN.CATALOG;
        await this.repo.save(existing);
      }
      return;
    }
    await this.repo
      .save(this.repo.create({ tenantId, name: clean, origin, sortOrder: 0, hidden: 0 }))
      // A concurrent sync may have inserted the same pair; the unique key is
      // the arbiter and losing that race is not an error worth failing a sync for.
      .catch((e) => this.logger.warn(`ensure(${clean}) lost the race: ${(e as Error).message}`));
  }

  async create(tenantId: number, name: string, label?: string | null): Promise<KbCategory> {
    const clean = name.trim();
    if (!clean || clean.length > 64) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
    const existing = await this.repo.findOne({ where: { tenantId, name: clean } });
    if (existing) throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.CONFLICT);
    return this.repo.save(
      this.repo.create({
        tenantId,
        name: clean,
        label: label?.trim() || null,
        origin: CATEGORY_ORIGIN.MANUAL,
      }),
    );
  }

  /**
   * Rename a category and everything filed under it, in one transaction.
   *
   * Both halves have to land together: the row is what the console lists and
   * the string is what the documents carry, so a half-applied rename leaves the
   * screen and the corpus disagreeing about what exists.
   *
   * Catalogue-derived categories are refused. Product sync compares a
   * document's stored category against the one it would write to decide the
   * document is unchanged, so a rename here is silently undone at the next
   * sync — and an edit that reverts itself is worse than one that was never
   * offered (PLN D8).
   */
  async rename(tenantId: number, id: number, to: string): Promise<KbCategory> {
    const row = await this.find(tenantId, id);
    const clean = to.trim();
    if (!clean || clean.length > 64) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
    if (row.origin === CATEGORY_ORIGIN.CATALOG) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
    if (clean === row.name) return row;

    const collision = await this.repo.findOne({ where: { tenantId, name: clean } });
    // Renaming onto an existing name is a merge, and a merge moves documents
    // the operator did not select. Make them say so.
    if (collision) throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.CONFLICT);

    const from = row.name;
    await this.dataSource.transaction(async (m) => {
      await m.update(KbCategory, { id: row.id }, { name: clean });
      await m.update(KbDocument, { tenantId, category: from }, { category: clean });
    });
    this.logger.log(`category renamed: ${from} -> ${clean} (tenant ${tenantId})`);
    return this.find(tenantId, id);
  }

  /**
   * Move every document from one or more categories into another, then drop the
   * emptied rows. One transaction, same reason as rename.
   */
  async merge(tenantId: number, fromIds: number[], intoId: number): Promise<{ moved: number }> {
    const into = await this.find(tenantId, intoId);
    const sources: KbCategory[] = [];
    for (const id of fromIds) {
      if (String(id) === String(intoId)) continue;
      const row = await this.find(tenantId, id);
      if (row.origin === CATEGORY_ORIGIN.CATALOG) {
        // Same bounce-back as rename: sync would refile these next run.
        throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
      }
      sources.push(row);
    }
    if (!sources.length) return { moved: 0 };

    let moved = 0;
    await this.dataSource.transaction(async (m) => {
      for (const src of sources) {
        const res = await m.update(
          KbDocument,
          { tenantId, category: src.name },
          { category: into.name },
        );
        moved += res.affected ?? 0;
        await m.delete(KbCategory, { id: src.id });
      }
    });
    this.logger.log(
      `categories merged into ${into.name}: ${sources.map((s) => s.name).join(', ')} ` +
        `(${moved} document(s), tenant ${tenantId})`,
    );
    return { moved };
  }

  async setHidden(tenantId: number, id: number, hidden: boolean): Promise<KbCategory> {
    const row = await this.find(tenantId, id);
    row.hidden = hidden ? 1 : 0;
    return this.repo.save(row);
  }

  async reorder(tenantId: number, ids: number[]): Promise<void> {
    const rows = await this.repo.find({ where: { tenantId } });
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

  /** Only an empty category can be removed — deleting one in use would strand its documents. */
  async remove(tenantId: number, id: number): Promise<void> {
    const row = await this.find(tenantId, id);
    const inUse = await this.docRepo.count({ where: { tenantId, category: row.name } });
    if (inUse > 0) throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.CONFLICT);
    await this.repo.delete({ id: row.id });
  }

  private async countsFor(tenantId: number): Promise<Map<string, number>> {
    const rows = await this.docRepo
      .createQueryBuilder('d')
      .select('d.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .where('d.tenant_id = :tenantId', { tenantId })
      .andWhere('d.category IS NOT NULL')
      .andWhere("d.category <> ''")
      .groupBy('d.category')
      .getRawMany<{ category: string; count: string }>();
    return new Map(rows.map((r) => [r.category, Number(r.count)]));
  }

  private async find(tenantId: number, id: number): Promise<KbCategory> {
    const row = await this.repo.findOne({ where: { id, tenantId } });
    if (!row) throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    return row;
  }
}
