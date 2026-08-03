import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from './entity/subscription.entity';
import { Session } from '../session/entity/session.entity';
import { SessionService } from '../session/session.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Recurring subscription orders (FR-043). Widget customer + tenant admin views. */
@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(Subscription) private readonly subRepo: Repository<Subscription>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    private readonly sessionService: SessionService,
  ) {}

  /** Widget-session authorization — single implementation in SessionService. */
  private requireCustomerId(token: string): Promise<number> {
    return this.sessionService.requireCustomerId(token);
  }

  async listForSession(token: string): Promise<Subscription[]> {
    const customerId = await this.requireCustomerId(token);
    return this.subRepo.find({ where: { customerId }, order: { id: 'DESC' } });
  }

  async cancel(token: string, id: number): Promise<Subscription> {
    const customerId = await this.requireCustomerId(token);
    const sub = await this.subRepo.findOne({ where: { id } });
    if (!sub || sub.customerId !== customerId) {
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    sub.status = 'cancelled';
    return this.subRepo.save(sub);
  }

  async listAll(tenantId: number, page: number, size: number): Promise<[Subscription[], number]> {
    return this.subRepo.findAndCount({
      where: { tenantId },
      order: { id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
  }
}
