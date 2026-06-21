import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { buildPagination, normalizePage } from '@ivy/common';
import { Inquiry } from './entity/inquiry.entity';
import { Session } from '../session/entity/session.entity';
import { InquiryMapper } from './inquiry.mapper';
import { Paginated } from '../../global/interceptor/transform.interceptor';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/**
 * Customer support inquiries (FR-044). Widget endpoints resolve the customer from
 * a session token; admins handle inquiries via the consult module.
 */
@Injectable()
export class InquiryService {
  constructor(
    @InjectRepository(Inquiry) private readonly inquiryRepo: Repository<Inquiry>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
  ) {}

  /** Open a new inquiry from the widget. */
  async create(sessionToken: string, conversationId?: string, orderId?: string) {
    const session = await this.loadSession(sessionToken);
    const inquiry = await this.inquiryRepo.save(
      this.inquiryRepo.create({
        customerId: session.customerId,
        conversationId: conversationId != null ? Number(conversationId) : null,
        orderId: orderId != null ? Number(orderId) : null,
        status: 'open',
      }),
    );
    return InquiryMapper.toView(inquiry);
  }

  /** List the session customer's inquiries (paginated). */
  async listForSession(sessionToken: string, page?: string, size?: string) {
    const session = await this.loadSession(sessionToken);
    const { page: p, size: s } = normalizePage(page, size);
    const [items, total] = await this.inquiryRepo.findAndCount({
      where: { customerId: session.customerId ?? IsNull() },
      order: { createdAt: 'DESC' },
      skip: (p - 1) * s,
      take: s,
    });
    return new Paginated(InquiryMapper.toViewList(items), buildPagination(p, s, total));
  }

  /** Admin: list the tenant's inquiries (paginated). */
  async listAll(tenantId: number, page?: string, size?: string) {
    const { page: p, size: s } = normalizePage(page, size);
    const [items, total] = await this.inquiryRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (p - 1) * s,
      take: s,
    });
    return new Paginated(InquiryMapper.toAdminViewList(items), buildPagination(p, s, total));
  }

  /** Admin: mark an inquiry answered (tenant-scoped). */
  async markAnswered(tenantId: number, id: number) {
    const inquiry = await this.inquiryRepo.findOne({ where: { id, tenantId } });
    if (!inquiry) throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    inquiry.status = 'answered';
    await this.inquiryRepo.save(inquiry);
    return InquiryMapper.toAdminView(inquiry);
  }

  private async loadSession(token: string): Promise<Session> {
    const session = await this.sessionRepo.findOne({ where: { sessionToken: token } });
    if (!session) throw new BusinessException(ERROR_CODE.SESSION_NOT_FOUND, HttpStatus.NOT_FOUND);
    return session;
  }
}
