import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { RestockSubscription } from './entity/restock-subscription.entity';
import { Session } from '../session/entity/session.entity';
import { EventBusService, EVENTS } from '../../infrastructure/infrastructure.module';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Back-in-stock notification requests (FR-042). Guests allowed (customer_id null). */
@Injectable()
export class RestockService {
  constructor(
    @InjectRepository(RestockSubscription)
    private readonly restockRepo: Repository<RestockSubscription>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    private readonly bus: EventBusService,
  ) {}

  async subscribe(
    sessionToken: string | undefined,
    productId: string,
    channel?: string,
  ): Promise<RestockSubscription> {
    let customerId: number | null = null;
    if (sessionToken) {
      const session = await this.sessionRepo.findOne({ where: { sessionToken } });
      customerId = session?.customerId ?? null;
    }
    return this.restockRepo.save(
      this.restockRepo.create({
        customerId,
        productId,
        channel: channel ?? 'in_app',
        notifiedAt: null,
      }),
    );
  }

  async listForSession(sessionToken: string): Promise<RestockSubscription[]> {
    const session = await this.sessionRepo.findOne({ where: { sessionToken } });
    if (!session) throw new BusinessException(ERROR_CODE.SESSION_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (session.customerId == null) {
      throw new BusinessException(ERROR_CODE.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
    }
    return this.restockRepo.find({
      where: { customerId: session.customerId },
      order: { id: 'DESC' },
    });
  }

  /** Notify all not-yet-notified subscribers for a product that it is back in stock. */
  async notifyRestock(productId: string): Promise<number> {
    const subs = await this.restockRepo.find({
      where: { productId, notifiedAt: IsNull() },
    });
    const now = new Date();
    for (const sub of subs) {
      await this.bus.publish(EVENTS.NOTIFICATION, {
        customerId: sub.customerId,
        category: 'shipping',
        title: 'Back in stock',
        body: `Good news — product ${sub.productId} is back in stock.`,
      });
      sub.notifiedAt = now;
      await this.restockRepo.save(sub);
    }
    return subs.length;
  }

  async listAll(
    tenantId: number,
    page: number,
    size: number,
  ): Promise<[RestockSubscription[], number]> {
    return this.restockRepo.findAndCount({
      where: { tenantId },
      order: { id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
  }
}
