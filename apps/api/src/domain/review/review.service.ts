import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CJM_STAGE } from '@ivy/types';
import { Review } from './entity/review.entity';
import { Session } from '../session/entity/session.entity';
import { OrderItem } from '../order/entity/order-item.entity';
import { EventBusService, EVENTS } from '../../infrastructure/infrastructure.module';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Product reviews per order item (FR-040). */
@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(Review) private readonly reviewRepo: Repository<Review>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(OrderItem) private readonly orderItemRepo: Repository<OrderItem>,
    private readonly bus: EventBusService,
  ) {}

  private async requireCustomerId(token: string): Promise<number> {
    const session = await this.sessionRepo.findOne({ where: { sessionToken: token } });
    if (!session) throw new BusinessException(ERROR_CODE.SESSION_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (session.customerId == null) {
      throw new BusinessException(ERROR_CODE.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
    }
    return session.customerId;
  }

  async create(
    token: string,
    orderItemId: number,
    rating: number,
    body?: string,
  ): Promise<Review> {
    const customerId = await this.requireCustomerId(token);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, {
        rating: ['rating must be an integer between 1 and 5'],
      });
    }
    const review = await this.reviewRepo.save(
      this.reviewRepo.create({
        orderItemId,
        customerId,
        rating,
        body: body ?? null,
        status: 'submitted',
      }),
    );
    await this.bus.publish(EVENTS.CJM, {
      stage: CJM_STAGE.POST,
      eventType: 'review_submitted',
      customerId,
    });
    return review;
  }

  async listForSession(token: string): Promise<Review[]> {
    const customerId = await this.requireCustomerId(token);
    return this.reviewRepo.find({ where: { customerId }, order: { id: 'DESC' } });
  }

  /** Ask a customer to review a delivered order item. */
  async requestReview(orderItemId: number, customerId: number): Promise<void> {
    await this.bus.publish(EVENTS.NOTIFICATION, {
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
}
