import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DiaryNote } from './entity/diary-note.entity';
import { ProductCache } from '../product/entity/product-cache.entity';
import { SessionService } from '../session/session.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** List cap — the diary screen loads the newest memos in one shot (no pagination v1). */
const LIST_MAX = 100;
/** Body length ceiling — mirrors the DTO @Length(1, 1000) and the column width. */
const BODY_MAX = 1000;

/**
 * Shopping-diary free memos (PLN-260807-IvyusaApp-Revamp F3, A-7).
 * Customer-bound only: an anonymous session gets 401 via the shared session gate.
 * Deliberately NO CJM emit — notes are private memos, not journey signals.
 */
@Injectable()
export class DiaryService {
  private readonly logger = new Logger(DiaryService.name);

  constructor(
    @InjectRepository(DiaryNote) private readonly diaryRepo: Repository<DiaryNote>,
    @InjectRepository(ProductCache) private readonly productRepo: Repository<ProductCache>,
    private readonly sessionService: SessionService,
  ) {}

  /** The customer's memos, newest first, capped at LIST_MAX. */
  async list(token: string, size?: number): Promise<DiaryNote[]> {
    const customerId = await this.sessionService.requireCustomerId(token);
    const take =
      size !== undefined && Number.isFinite(size) && size > 0
        ? Math.min(Math.floor(size), LIST_MAX)
        : LIST_MAX;
    return this.diaryRepo.find({
      where: { customerId },
      order: { id: 'DESC' },
      take,
    });
  }

  /** Create a memo; a given product_handle must exist in the tenant catalog (404 otherwise). */
  async create(token: string, body: string, productHandle?: string): Promise<DiaryNote> {
    const session = await this.sessionService.requireCustomer(token);
    const customerId = session.customerId as number;

    // Defense-in-depth alongside the DTO @Length(1, 1000) — the service is also
    // reachable without the HTTP validation pipe (tests, future internal callers).
    if (body.length < 1 || body.length > BODY_MAX) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
    if (productHandle !== undefined) {
      await this.requireCatalogProduct(session.tenantId, productHandle);
    }

    return this.diaryRepo.save(
      this.diaryRepo.create({
        tenantId: session.tenantId,
        customerId,
        body,
        productHandle: productHandle ?? null,
      }),
    );
  }

  /**
   * Idempotent remove. Ownership lives in the WHERE: someone else's note id (or a
   * note already gone) simply affects 0 rows — no oracle for probing foreign ids.
   */
  async remove(token: string, id: number): Promise<boolean> {
    const customerId = await this.sessionService.requireCustomerId(token);
    const result = await this.diaryRepo.delete({ id, customerId });
    return (result.affected ?? 0) > 0;
  }

  /** Only catalog products are pinnable (no dangling handles — same rule as saves). */
  private async requireCatalogProduct(tenantId: number | null, handle: string): Promise<void> {
    const product =
      tenantId == null ? null : await this.productRepo.findOne({ where: { tenantId, handle } });
    if (!product) {
      // 4xx are not server-logged by default — leave a trace of the rejection.
      this.logger.warn(`diary note rejected: handle "${handle}" not in catalog (tenant=${tenantId})`);
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
  }
}
