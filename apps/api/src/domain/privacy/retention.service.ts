import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Conversation } from '../chat/entity/conversation.entity';
import { Message } from '../chat/entity/message.entity';
import { CjmEvent } from '../cjm/entity/cjm-event.entity';
import { AuditService } from '../audit/audit.service';

export interface RetentionPurgeResult {
  retentionDays: number;
  cutoff: string;
  messages: number;
  conversations: number;
  cjmEvents: number;
}

/**
 * Data retention / disposal (POL-003). Conversation logs and journey events are
 * disposed of once older than the configured retention window.
 *
 * NOTE: schedule via @nestjs/schedule in production. The manual endpoint exists
 * so disposal can be triggered/verified without a scheduler.
 */
@Injectable()
export class RetentionService {
  constructor(
    @InjectRepository(Conversation) private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Message) private readonly messageRepo: Repository<Message>,
    @InjectRepository(CjmEvent) private readonly cjmRepo: Repository<CjmEvent>,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private retentionDays(): number {
    // env values arrive as strings; coerce and fall back on a non-positive/NaN value.
    const raw = this.config.get<string | number>('CONVERSATION_LOG_RETENTION_DAYS', 365);
    const days = Number(raw);
    return Number.isFinite(days) && days > 0 ? days : 365;
  }

  /** Delete messages, then conversations, then cjm_events older than the retention window. */
  async purgeExpired(): Promise<RetentionPurgeResult> {
    const retentionDays = this.retentionDays();
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    // Messages first (child of conversations), then conversations, then journey events.
    const msg = await this.messageRepo.delete({ createdAt: LessThan(cutoff) });
    const conv = await this.conversationRepo.delete({ createdAt: LessThan(cutoff) });
    const cjm = await this.cjmRepo.delete({ createdAt: LessThan(cutoff) });

    const result: RetentionPurgeResult = {
      retentionDays,
      cutoff: cutoff.toISOString(),
      messages: msg.affected ?? 0,
      conversations: conv.affected ?? 0,
      cjmEvents: cjm.affected ?? 0,
    };

    await this.audit.write({
      tenantId: null,
      actorType: 'admin',
      actorId: 0,
      action: 'retention.purge',
      target: `cutoff=${result.cutoff} msgs=${result.messages} convs=${result.conversations} cjm=${result.cjmEvents}`,
    });

    return result;
  }
}
