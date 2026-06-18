import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CJM_STAGE, CONSENT_STATE, SESSION_LANGUAGE } from '@ivy/types';
import { generateToken } from '@ivy/common';
import { Session } from './entity/session.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { EventBusService, EVENTS } from '../../infrastructure/infrastructure.module';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/**
 * Session lifecycle (S1 / FN-006). Creates or resumes a widget session, tracks
 * CCPA consent, and resolves UI language. Emits a CJM Awareness event on create.
 */
@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly bus: EventBusService,
  ) {}

  async ensure(token: string | undefined, locale: string | undefined, shopDomain?: string): Promise<Session> {
    if (token) {
      const existing = await this.sessionRepo.findOne({ where: { sessionToken: token } });
      if (existing) return existing;
    }
    const tenant = shopDomain
      ? await this.tenantRepo.findOne({ where: { shopDomain } })
      : await this.tenantRepo.findOne({ where: {}, order: { id: 'ASC' } });

    const session = await this.sessionRepo.save(
      this.sessionRepo.create({
        sessionToken: generateToken(),
        language: this.resolveLanguage(locale),
        consentState: CONSENT_STATE.PENDING,
        customerId: null,
      }),
    );
    await this.bus.publish(EVENTS.CJM, {
      tenantId: tenant?.id ?? null,
      sessionId: session.id,
      customerId: null,
      stage: CJM_STAGE.AWARENESS,
      eventType: 'session_start',
    });
    return session;
  }

  async findByToken(token: string): Promise<Session> {
    const session = await this.sessionRepo.findOne({ where: { sessionToken: token } });
    if (!session) throw new BusinessException(ERROR_CODE.SESSION_NOT_FOUND, HttpStatus.NOT_FOUND);
    return session;
  }

  async setConsent(token: string, granted: boolean): Promise<Session> {
    const session = await this.findByToken(token);
    session.consentState = granted ? CONSENT_STATE.GRANTED : CONSENT_STATE.DECLINED;
    return this.sessionRepo.save(session);
  }

  async setLanguage(token: string, language: string): Promise<Session> {
    const session = await this.findByToken(token);
    session.language = this.resolveLanguage(language);
    return this.sessionRepo.save(session);
  }

  async bindCustomer(sessionId: number, customerId: number): Promise<void> {
    await this.sessionRepo.update({ id: sessionId }, { customerId });
  }

  private resolveLanguage(locale?: string): string {
    const l = (locale ?? '').toLowerCase();
    if (l.startsWith('es')) return SESSION_LANGUAGE.ES;
    if (l.startsWith('ko')) return SESSION_LANGUAGE.KO;
    return SESSION_LANGUAGE.EN;
  }
}
