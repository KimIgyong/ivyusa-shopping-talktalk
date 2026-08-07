import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CJM_STAGE } from '@ivy/types';
import { generateCode } from '@ivy/common';
import { Nudge } from './entity/nudge.entity';
import { ProductCache } from '../product/entity/product-cache.entity';
import { Customer } from '../customer/entity/customer.entity';
import { SessionService } from '../session/session.service';
import { EventBusService, EVENTS } from '../../infrastructure/infrastructure.module';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Where the public nudge card lives (PWA route). Env-overridable per environment. */
function appPublicUrl(): string {
  return process.env.APP_PUBLIC_URL || 'https://shoptalk.amoeba.site';
}

/** Retry budget for the (astronomically unlikely) share-code collision. */
const CODE_ATTEMPTS = 5;

/**
 * "Please buy me this" nudges (PLN-260807-IvyusaApp-Revamp F2, A-5).
 * Creating requires a customer-bound session; VIEWING is fully public — the
 * whole point is that a recipient without the app can open the card.
 */
@Injectable()
export class NudgeService {
  private readonly logger = new Logger(NudgeService.name);

  constructor(
    @InjectRepository(Nudge) private readonly nudgeRepo: Repository<Nudge>,
    @InjectRepository(ProductCache) private readonly productRepo: Repository<ProductCache>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    private readonly sessionService: SessionService,
    private readonly bus: EventBusService,
  ) {}

  async create(
    token: string,
    productHandle: string,
    message?: string,
  ): Promise<{ code: string; url: string }> {
    const session = await this.sessionService.requireCustomer(token);
    const customerId = session.customerId as number;

    const product =
      session.tenantId == null
        ? null
        : await this.productRepo.findOne({ where: { tenantId: session.tenantId, handle: productHandle } });
    if (!product) {
      // 4xx are not server-logged by default — leave a trace of the rejection.
      this.logger.warn(
        `nudge rejected: handle "${productHandle}" not in catalog (tenant=${session.tenantId})`,
      );
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }

    const code = await this.uniqueCode();
    const nudge = await this.nudgeRepo.save(
      this.nudgeRepo.create({
        tenantId: session.tenantId,
        customerId,
        productHandle,
        message: message ?? null,
        code,
      }),
    );
    await this.bus.publish(EVENTS.CJM, {
      tenantId: session.tenantId,
      customerId,
      sessionId: session.id,
      stage: CJM_STAGE.BROWSE,
      eventType: 'nudge_sent',
      payload: { handle: productHandle },
    });
    return { code: nudge.code, url: `${appPublicUrl()}/app/nudge/${nudge.code}` };
  }

  /**
   * Public card view — counts the view atomically (UPDATE views = views + 1;
   * a read-modify-write would drop concurrent opens). The sender's name rides
   * along deliberately: sharing the card IS the sender's intent (the entity
   * transformer decrypts the encrypted-at-rest name on read).
   */
  async viewByCode(code: string): Promise<{
    nudge: Nudge;
    senderName: string | null;
    product: ProductCache | null;
  }> {
    const nudge = await this.nudgeRepo.findOne({ where: { code } });
    if (!nudge) {
      this.logger.warn(`nudge view rejected: unknown code "${code}"`);
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    await this.nudgeRepo.increment({ id: nudge.id }, 'views', 1);

    const [product, customer] = await Promise.all([
      nudge.tenantId == null
        ? Promise.resolve(null)
        : this.productRepo.findOne({
            where: { tenantId: nudge.tenantId, handle: nudge.productHandle },
          }),
      this.customerRepo.findOne({ where: { id: nudge.customerId } }),
    ]);
    return { nudge, senderName: customer?.name ?? null, product };
  }

  private async uniqueCode(): Promise<string> {
    for (let i = 0; i < CODE_ATTEMPTS; i += 1) {
      const code = generateCode(10);
      const clash = await this.nudgeRepo.findOne({ where: { code } });
      if (!clash) return code;
    }
    // 32^10 keyspace — reaching here means the RNG is broken, not bad luck.
    throw new BusinessException(ERROR_CODE.INTERNAL_ERROR, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
