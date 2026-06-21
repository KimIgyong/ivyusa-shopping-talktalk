import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { generateCode } from '@ivy/common';
import { Affiliate } from './entity/affiliate.entity';
import { Session } from '../session/entity/session.entity';
import { Customer } from '../customer/entity/customer.entity';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Affiliate program enrollment (FR-041). */
@Injectable()
export class AffiliateService {
  constructor(
    @InjectRepository(Affiliate) private readonly affiliateRepo: Repository<Affiliate>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
  ) {}

  private async requireCustomerId(token: string): Promise<number> {
    const session = await this.sessionRepo.findOne({ where: { sessionToken: token } });
    if (!session) throw new BusinessException(ERROR_CODE.SESSION_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (session.customerId == null) {
      throw new BusinessException(ERROR_CODE.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
    }
    return session.customerId;
  }

  async apply(token: string): Promise<Affiliate> {
    const customerId = await this.requireCustomerId(token);
    const existing = await this.affiliateRepo.findOne({ where: { customerId } });
    if (existing) return existing;
    return this.affiliateRepo.save(
      this.affiliateRepo.create({ customerId, status: 'pending', linkCode: null }),
    );
  }

  async status(token: string): Promise<Affiliate | null> {
    const customerId = await this.requireCustomerId(token);
    return this.affiliateRepo.findOne({ where: { customerId } });
  }

  async listAll(tenantId: number, page: number, size: number): Promise<[Affiliate[], number]> {
    return this.affiliateRepo.findAndCount({
      where: { tenantId },
      order: { id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
  }

  async review(tenantId: number, id: number, decision: 'approve' | 'reject'): Promise<Affiliate> {
    const affiliate = await this.affiliateRepo.findOne({ where: { id, tenantId } });
    if (!affiliate) {
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    affiliate.reviewedAt = new Date();
    if (decision === 'approve') {
      affiliate.status = 'approved';
      affiliate.linkCode = generateCode(8);
    } else {
      affiliate.status = 'rejected';
    }
    return this.affiliateRepo.save(affiliate);
  }
}
