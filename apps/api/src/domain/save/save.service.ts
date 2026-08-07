import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CJM_STAGE } from '@ivy/types';
import { ProductSave, SAVE_LIST, SaveList } from './entity/product-save.entity';
import { ProductCache } from '../product/entity/product-cache.entity';
import { SessionService } from '../session/session.service';
import { EventBusService, EVENTS } from '../../infrastructure/infrastructure.module';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** A save row with its catalog join (null when the handle left the catalog). */
export interface SaveWithProduct {
  save: ProductSave;
  product: ProductCache | null;
}

/**
 * Wishlist / save-for-later (PLN-260807-IvyusaApp-Revamp F2, A-4).
 * Customer-bound only: an anonymous session gets 401 via the shared session gate
 * — saves are personal data (DSAR export + erasure paths in PrivacyService).
 */
@Injectable()
export class SaveService {
  private readonly logger = new Logger(SaveService.name);

  constructor(
    @InjectRepository(ProductSave) private readonly saveRepo: Repository<ProductSave>,
    @InjectRepository(ProductCache) private readonly productRepo: Repository<ProductCache>,
    private readonly sessionService: SessionService,
    private readonly bus: EventBusService,
  ) {}

  /**
   * The customer's saves, newest first, with the tenant's catalog cards joined
   * by handle. A save whose handle is no longer in the catalog is still
   * returned (product: null) so the client can show and remove it.
   */
  async list(token: string, list?: SaveList): Promise<SaveWithProduct[]> {
    const session = await this.sessionService.requireCustomer(token);
    const customerId = session.customerId as number;
    const where: Record<string, unknown> = { customerId };
    if (list) where.list = list;
    const saves = await this.saveRepo.find({ where, order: { id: 'DESC' } });

    const handles = [...new Set(saves.map((s) => s.productHandle))];
    const products =
      handles.length && session.tenantId != null
        ? await this.productRepo.find({
            where: { tenantId: session.tenantId, handle: In(handles) },
          })
        : [];
    const byHandle = new Map(products.map((p) => [p.handle, p]));
    return saves.map((save) => ({ save, product: byHandle.get(save.productHandle) ?? null }));
  }

  /**
   * Upsert on uk (customer, handle, list): a re-save updates the note in place.
   * Only a NEW save emits the Browse journey event (re-saving is not a signal).
   */
  async upsert(
    token: string,
    productHandle: string,
    list: SaveList,
    note?: string,
  ): Promise<SaveWithProduct> {
    const session = await this.sessionService.requireCustomer(token);
    const customerId = session.customerId as number;
    const product = await this.requireCatalogProduct(session.tenantId, productHandle);

    const existing = await this.saveRepo.findOne({ where: { customerId, productHandle, list } });
    if (existing) {
      if (note !== undefined) existing.note = note;
      const saved = await this.saveRepo.save(existing);
      return { save: saved, product };
    }

    const created = await this.saveRepo.save(
      this.saveRepo.create({
        tenantId: session.tenantId,
        customerId,
        productHandle,
        list,
        note: note ?? null,
      }),
    );
    await this.bus.publish(EVENTS.CJM, {
      tenantId: session.tenantId,
      customerId,
      sessionId: session.id,
      stage: CJM_STAGE.BROWSE,
      eventType: list === SAVE_LIST.WISH ? 'wish_added' : 'save_added',
      payload: { handle: productHandle },
    });
    return { save: created, product };
  }

  /** Idempotent: removing a save that does not exist is a no-op, not an error. */
  async remove(token: string, productHandle: string, list: SaveList): Promise<boolean> {
    const customerId = await this.sessionService.requireCustomerId(token);
    const result = await this.saveRepo.delete({ customerId, productHandle, list });
    return (result.affected ?? 0) > 0;
  }

  /** Only products in the tenant's catalog are saveable (no dangling handles). */
  private async requireCatalogProduct(
    tenantId: number | null,
    handle: string,
  ): Promise<ProductCache> {
    const product =
      tenantId == null ? null : await this.productRepo.findOne({ where: { tenantId, handle } });
    if (!product) {
      // 4xx are not server-logged by default — leave a trace of the rejection.
      this.logger.warn(`save rejected: handle "${handle}" not in catalog (tenant=${tenantId})`);
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    return product;
  }
}
