import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CjmEvent } from './entity/cjm-event.entity';
import { EventBusService, EVENTS } from '../../infrastructure/infrastructure.module';

/** Payload accepted on EVENTS.CJM (tenantId is carried for routing but not stored). */
interface CjmEventInput {
  tenantId?: number | null;
  sessionId?: number | null;
  customerId?: number | null;
  stage: string;
  eventType: string;
  payload?: Record<string, unknown> | null;
}

/** Customer journey map events (FR-046/047). Persists journey events from the bus. */
@Injectable()
export class CjmService implements OnModuleInit {
  constructor(
    @InjectRepository(CjmEvent) private readonly cjmRepo: Repository<CjmEvent>,
    private readonly bus: EventBusService,
  ) {}

  onModuleInit(): void {
    this.bus.subscribe(EVENTS.CJM, async (payload: unknown) => {
      await this.record(payload as CjmEventInput);
    });
  }

  /** Persist a cjm_events row. Idempotent enough: append-only event log. */
  async record(input: CjmEventInput): Promise<CjmEvent> {
    return this.cjmRepo.save(
      this.cjmRepo.create({
        sessionId: input.sessionId ?? null,
        customerId: input.customerId ?? null,
        stage: input.stage,
        eventType: input.eventType,
        payload: input.payload ?? null,
      }),
    );
  }

  async list(
    stage: string | undefined,
    customerId: number | undefined,
    page: number,
    size: number,
  ): Promise<[CjmEvent[], number]> {
    const where: Record<string, unknown> = {};
    if (stage) where.stage = stage;
    if (customerId !== undefined) where.customerId = customerId;
    return this.cjmRepo.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
  }
}
