import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DELIVERY_STEPS,
  FULFILLMENT_STATUS,
  ORDER_STATUS_INTERNAL,
  fulfillmentStepIndex,
  internalToUiStatus,
} from '@ivy/types';
import { buildPagination, normalizePage } from '@ivy/common';
import { INTEGRATION_PROVIDER } from '@ivy/types';
import { OrderCache } from './entity/order-cache.entity';
import { OrderItem } from './entity/order-item.entity';
import { Fulfillment } from './entity/fulfillment.entity';
import { Session } from '../session/entity/session.entity';
import { Customer } from '../customer/entity/customer.entity';
import { OrderMapper } from './order.mapper';
import { Paginated } from '../../global/interceptor/transform.interceptor';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { EventBusService, EVENTS } from '../../infrastructure/infrastructure.module';
import { RedisService } from '../../infrastructure/cache/redis.service';
import { WebhookSecretService } from '../tenant/webhook-secret.service';
import { assertWebhookSecret } from '../../global/util/webhook-secret.util';

const LOOKUP_MAX_ATTEMPTS = 5;
const LOOKUP_WINDOW_SEC = 15 * 60;

/**
 * Order read access (FR-019/020/021). Widget endpoints resolve the customer from
 * a session token; order data requires an authenticated (bound) customer (POL-001).
 * Guest lookup verifies identity (order number + email) and binds the session.
 */
@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(OrderCache) private readonly orderRepo: Repository<OrderCache>,
    @InjectRepository(OrderItem) private readonly itemRepo: Repository<OrderItem>,
    @InjectRepository(Fulfillment) private readonly fulfillRepo: Repository<Fulfillment>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    private readonly bus: EventBusService,
    private readonly redis: RedisService,
    private readonly webhookSecretService: WebhookSecretService,
  ) {}

  /** Guest order lookup (FR-019). Rate-limited per email; binds session on success. */
  async guestLookup(sessionToken: string, orderNumber: string, email: string) {
    const session = await this.loadSession(sessionToken);
    // The session must be bound to a tenant; otherwise a lookup could match and
    // bind a customer from another tenant (SEC-H2). Refuse rather than guess.
    if (session.tenantId == null) {
      throw new BusinessException(ERROR_CODE.TENANT_NOT_FOUND, HttpStatus.BAD_REQUEST);
    }
    await this.enforceLookupLimit(email);

    const order = await this.orderRepo
      .createQueryBuilder('o')
      .innerJoin(Customer, 'c', 'c.id = o.customer_id')
      .where('o.order_number = :orderNumber', { orderNumber })
      .andWhere('c.email = :email', { email })
      .andWhere('o.tenant_id = :tenantId', { tenantId: session.tenantId })
      .andWhere('c.tenant_id = :tenantId', { tenantId: session.tenantId })
      .getOne();

    if (!order) throw new BusinessException(ERROR_CODE.ORDER_NOT_FOUND, HttpStatus.NOT_FOUND);

    session.customerId = order.customerId;
    await this.sessionRepo.save(session);

    return OrderMapper.toSummary(order);
  }

  /** List the bound customer's orders (paginated). */
  async listForSession(sessionToken: string, page?: string, size?: string) {
    const customerId = await this.requireCustomerId(sessionToken);
    const { page: p, size: s } = normalizePage(page, size);

    const [orders, total] = await this.orderRepo.findAndCount({
      where: { customerId },
      order: { createdAt: 'DESC' },
      skip: (p - 1) * s,
      take: s,
    });

    const items = await Promise.all(
      orders.map(async (o) =>
        OrderMapper.toListItem(o, await this.itemRepo.count({ where: { orderId: o.id } })),
      ),
    );
    return new Paginated(items, buildPagination(p, s, total));
  }

  /** Order detail (items + totals), scoped to the bound customer. */
  async detailForSession(sessionToken: string, orderId: number) {
    const customerId = await this.requireCustomerId(sessionToken);
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order || order.customerId !== customerId) {
      throw new BusinessException(ERROR_CODE.ORDER_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    const items = await this.itemRepo.find({ where: { orderId: order.id }, order: { id: 'ASC' } });
    return OrderMapper.toDetail(order, items);
  }

  /** Latest fulfillment + delivery stepper for an order (FR-031). */
  async trackingForSession(sessionToken: string, orderId: number) {
    const customerId = await this.requireCustomerId(sessionToken);
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order || order.customerId !== customerId) {
      throw new BusinessException(ERROR_CODE.ORDER_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    const fulfillment = await this.fulfillRepo.findOne({
      where: { orderId: order.id },
      order: { updatedAt: 'DESC' },
    });
    const status = fulfillment?.status ?? FULFILLMENT_STATUS.PREPARING;
    return {
      status,
      carrier: fulfillment?.carrier ?? null,
      trackingNumber: fulfillment?.trackingNumber ?? null,
      stepIndex: fulfillmentStepIndex(status),
      steps: DELIVERY_STEPS,
    };
  }

  /** Admin view: all orders for the tenant (paginated). */
  async listAll(tenantId: number, page?: string, size?: string) {
    const { page: p, size: s } = normalizePage(page, size);
    const [orders, total] = await this.orderRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (p - 1) * s,
      take: s,
    });
    const items = await Promise.all(
      orders.map(async (o) =>
        OrderMapper.toListItem(o, await this.itemRepo.count({ where: { orderId: o.id } })),
      ),
    );
    return new Paginated(items, buildPagination(p, s, total));
  }

  /** Fulfillment webhook (FR-021): upsert fulfillment, sync order status, notify. */
  async handleFulfillmentWebhook(
    orderId: number,
    status: string,
    trackingNumber?: string,
    carrier?: string,
    providedSecret?: string,
  ) {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new BusinessException(ERROR_CODE.ORDER_NOT_FOUND, HttpStatus.NOT_FOUND);

    // Authenticate the caller against the order's tenant secret (per-tenant if the
    // tenant configured one, else the global env fallback), before any mutation.
    const expected = await this.webhookSecretService.resolve(
      INTEGRATION_PROVIDER.FULFILLMENT,
      order.tenantId,
    );
    assertWebhookSecret(providedSecret, expected);

    let fulfillment = await this.fulfillRepo.findOne({ where: { orderId } });
    if (fulfillment) {
      fulfillment.status = status;
      fulfillment.trackingNumber = trackingNumber ?? fulfillment.trackingNumber;
      fulfillment.carrier = carrier ?? fulfillment.carrier;
    } else {
      fulfillment = this.fulfillRepo.create({
        orderId,
        status,
        trackingNumber: trackingNumber ?? null,
        carrier: carrier ?? null,
      });
    }
    await this.fulfillRepo.save(fulfillment);

    const internal = this.mapFulfillmentToInternal(status);
    if (internal) {
      order.statusInternal = internal;
      order.statusUi = internalToUiStatus(internal);
      await this.orderRepo.save(order);
    }
    const statusUi = order.statusInternal ? internalToUiStatus(order.statusInternal) : order.statusUi;

    await this.bus.publish(EVENTS.WEBHOOK_FULFILLMENT, {
      orderId,
      status,
      trackingNumber: fulfillment.trackingNumber,
      carrier: fulfillment.carrier,
    });
    await this.bus.publish(EVENTS.NOTIFICATION, {
      customerId: order.customerId,
      category: 'shipping',
      title: 'Shipping update',
      body: `Your order ${order.orderNumber} is now ${statusUi ?? status}.`,
      statusBadge: statusUi,
    });

    return { received: true };
  }

  // ---- helpers ----
  private mapFulfillmentToInternal(status: string): string | null {
    if (status === FULFILLMENT_STATUS.SHIPPED || status === FULFILLMENT_STATUS.IN_TRANSIT) {
      return ORDER_STATUS_INTERNAL.SHIPPING;
    }
    if (status === FULFILLMENT_STATUS.DELIVERED) return ORDER_STATUS_INTERNAL.DELIVERED;
    return null;
  }

  private async loadSession(token: string): Promise<Session> {
    const session = await this.sessionRepo.findOne({ where: { sessionToken: token } });
    if (!session) throw new BusinessException(ERROR_CODE.SESSION_NOT_FOUND, HttpStatus.NOT_FOUND);
    return session;
  }

  /** Resolve bound customer; order data requires auth (POL-001). */
  private async requireCustomerId(token: string): Promise<number> {
    const session = await this.loadSession(token);
    if (session.customerId == null) {
      throw new BusinessException(ERROR_CODE.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
    }
    return session.customerId;
  }

  private async enforceLookupLimit(email: string): Promise<void> {
    const key = `lookup:${email}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.set(key, '1', LOOKUP_WINDOW_SEC);
    if (count > LOOKUP_MAX_ATTEMPTS) {
      throw new BusinessException(ERROR_CODE.GUEST_LOOKUP_LIMIT, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
