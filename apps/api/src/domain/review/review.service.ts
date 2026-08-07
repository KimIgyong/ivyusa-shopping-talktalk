import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CJM_STAGE, MODERATION_DECISION } from '@ivy/types';
import { Review, ReviewStatus } from './entity/review.entity';
import { Session } from '../session/entity/session.entity';
import { SessionService } from '../session/session.service';
import { OrderItem } from '../order/entity/order-item.entity';
import { OrderCache } from '../order/entity/order-cache.entity';
import { ModerationService } from '../moderation/moderation.service';
import { EventBusService, EVENTS } from '../../infrastructure/infrastructure.module';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Product reviews per order item (FR-040). */
@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    @InjectRepository(Review) private readonly reviewRepo: Repository<Review>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(OrderItem) private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(OrderCache) private readonly orderRepo: Repository<OrderCache>,
    private readonly sessionService: SessionService,
    private readonly moderation: ModerationService,
    private readonly bus: EventBusService,
  ) {}

  async create(
    token: string,
    orderItemId: number,
    rating: number,
    body?: string,
  ): Promise<Review> {
    const session = await this.sessionService.requireCustomer(token);
    const customerId = session.customerId as number;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, {
        rating: ['rating must be an integer between 1 and 5'],
      });
    }

    // D1 — ownership: only the customer who bought the item may review it.
    // 4xx are not server-logged by default, so each rejection leaves a trace.
    const item = await this.orderItemRepo.findOne({ where: { id: orderItemId } });
    if (!item) {
      this.logger.warn(`review rejected: order item ${orderItemId} not found`);
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    const order = await this.orderRepo.findOne({ where: { id: item.orderId } });
    if (!order || order.customerId == null || Number(order.customerId) !== Number(customerId)) {
      this.logger.warn(
        `review rejected: item ${orderItemId} (order ${item.orderId}) not owned by customer ${customerId}`,
      );
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }

    // D2 — the same non-bypassable outbound gate as chat/campaigns (FR-069):
    // review bodies surface publicly, so the masked/rephrased output is what
    // gets stored and a BLOCKED verdict aborts the submission (fail-safe).
    let finalBody = body ?? null;
    if (finalBody != null && finalBody.trim() !== '') {
      const moderated = await this.moderation.moderate({
        tenantId: session.tenantId ?? 0,
        scope: 'agent',
        authorType: 'agent',
        text: finalBody,
      });
      if (moderated.decision === MODERATION_DECISION.BLOCKED) {
        this.logger.warn(
          `review body blocked by moderation (customer=${customerId}, item=${orderItemId})`,
        );
        throw new BusinessException(ERROR_CODE.MODERATION_BLOCKED, HttpStatus.UNPROCESSABLE_ENTITY);
      }
      finalBody = moderated.text;
    }

    const review = await this.reviewRepo.save(
      this.reviewRepo.create({
        tenantId: session.tenantId,
        orderItemId,
        customerId,
        rating,
        body: finalBody,
        status: 'submitted',
      }),
    );
    await this.bus.publish(EVENTS.CJM, {
      tenantId: session.tenantId,
      sessionId: session.id,
      stage: CJM_STAGE.POST,
      eventType: 'review_submitted',
      customerId,
    });
    return review;
  }

  /** The customer's own reviews — ALL statuses: hiding filters storefront surfaces, not the author's list. */
  async listForSession(token: string): Promise<Review[]> {
    const customerId = await this.sessionService.requireCustomerId(token);
    return this.reviewRepo.find({ where: { customerId }, order: { id: 'DESC' } });
  }

  /** Ask a customer to review a delivered order item. */
  async requestReview(orderItemId: number, customerId: number, tenantId?: number | null): Promise<void> {
    await this.bus.publish(EVENTS.NOTIFICATION, {
      tenantId: tenantId ?? null,
      customerId,
      orderItemId,
      category: 'review',
      title: 'How was your order?',
      statusBadge: 'Review',
    });
  }

  async listAll(tenantId: number, page: number, size: number): Promise<[Review[], number]> {
    return this.reviewRepo.findAndCount({
      where: { tenantId },
      order: { id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
  }

  /** D3 — console hide/unhide. Tenant-scoped: a review outside the tenant is a 404. */
  async updateStatus(tenantId: number, id: number, status: ReviewStatus): Promise<Review> {
    const review = await this.reviewRepo.findOne({ where: { id, tenantId } });
    if (!review) {
      this.logger.warn(`review status change rejected: review ${id} not in tenant ${tenantId}`);
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    review.status = status;
    return this.reviewRepo.save(review);
  }
}
