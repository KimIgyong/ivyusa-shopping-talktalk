import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, MoreThan, Or, Repository } from 'typeorm';
import { CHANNEL_DIRECTION, OUTBOX_STATUS, SENDER_TYPE } from '@ivy/types';
import { Message } from '../chat/entity/message.entity';
import { MessengerChannel } from './entity/messenger-channel.entity';
import { ChannelThread } from './entity/channel-thread.entity';
import { ChannelMessageMap } from './entity/channel-message-map.entity';
import { ChannelOutbox } from './entity/channel-outbox.entity';
import { AdapterRegistry } from './adapter/adapter.registry';
import { decryptChannelSecret } from './messenger-secret.util';

/** Backoff ladder; the last entry repeats until MAX_ATTEMPTS is spent. */
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000];
const MAX_ATTEMPTS = 5;
/** Rows drained per worker tick — bounded so one stuck channel can't hog it. */
const BATCH = 25;
/** Messages scanned per thread flush. */
const SCAN_LIMIT = 20;

/**
 * Outbound relay (PLN-260810 §4.1). Chat and agent code stay untouched: the
 * outbox scans forward from each thread's `outbound_cursor`, so any message
 * those paths persist — AI answer, agent reply, system notice — reaches the
 * channel without them knowing channels exist.
 */
@Injectable()
export class MessengerOutboxService {
  private readonly logger = new Logger(MessengerOutboxService.name);

  constructor(
    @InjectRepository(ChannelOutbox) private readonly outboxRepo: Repository<ChannelOutbox>,
    @InjectRepository(ChannelThread) private readonly threadRepo: Repository<ChannelThread>,
    @InjectRepository(ChannelMessageMap) private readonly mapRepo: Repository<ChannelMessageMap>,
    @InjectRepository(MessengerChannel) private readonly channelRepo: Repository<MessengerChannel>,
    @InjectRepository(Message) private readonly msgRepo: Repository<Message>,
    private readonly registry: AdapterRegistry,
  ) {}

  /**
   * Queue everything new on a thread, then try to deliver it. Advancing the
   * cursor past skipped messages is deliberate: a customer turn must never be
   * reconsidered as outbound work.
   */
  async flushThread(threadId: number): Promise<void> {
    const thread = await this.threadRepo.findOne({ where: { id: threadId } });
    if (!thread?.conversationId) return;

    const messages = await this.msgRepo.find({
      where: {
        conversationId: thread.conversationId,
        id: MoreThan(thread.outboundCursor ?? 0),
      },
      order: { id: 'ASC' },
      take: SCAN_LIMIT,
    });

    let cursor = thread.outboundCursor ?? 0;
    for (const message of messages) {
      const id = Number(message.id);
      cursor = id;
      // Loop prevention #3 (a): the shopper's own words never go back to them.
      if (message.senderType === SENDER_TYPE.USER) continue;
      // Loop prevention #3 (b): defence in depth for any inbound-origin row.
      const inboundOrigin = await this.mapRepo.findOne({
        where: { messageId: id, direction: CHANNEL_DIRECTION.INBOUND },
      });
      if (inboundOrigin) continue;
      if (!message.body?.trim()) continue;

      await this.outboxRepo
        .save(
          this.outboxRepo.create({
            tenantId: thread.tenantId,
            threadId: thread.id,
            messageId: id,
            status: OUTBOX_STATUS.PENDING,
            attempts: 0,
            nextAttemptAt: null,
          }),
        )
        // uk_co_message — already queued by a concurrent flush.
        .catch(() => undefined);
    }

    if (cursor !== (thread.outboundCursor ?? 0)) {
      await this.threadRepo.update({ id: thread.id }, { outboundCursor: cursor });
    }
    await this.deliverPendingForThread(thread.id);
  }

  /** Queue new messages for every thread that has some (worker sweep). */
  async flushAllThreads(limit = 100): Promise<number> {
    const rows = await this.threadRepo
      .createQueryBuilder('t')
      .select('t.id', 'id')
      .innerJoin(Message, 'm', 'm.conversation_id = t.conversation_id')
      .where('t.conversation_id IS NOT NULL')
      .andWhere('m.id > COALESCE(t.outbound_cursor, 0)')
      .groupBy('t.id')
      .limit(limit)
      .getRawMany<{ id: number }>();

    for (const row of rows) {
      await this.flushThread(Number(row.id)).catch((e) =>
        this.logger.warn(`flush thread ${row.id} failed: ${(e as Error).message}`),
      );
    }
    return rows.length;
  }

  /** Deliver rows whose backoff has elapsed (worker tick). */
  async deliverDue(): Promise<number> {
    const due = await this.outboxRepo.find({
      where: {
        status: OUTBOX_STATUS.PENDING,
        nextAttemptAt: Or(IsNull(), LessThanOrEqual(new Date())),
      },
      order: { id: 'ASC' },
      take: BATCH,
    });
    for (const row of due) await this.deliver(row);
    return due.length;
  }

  private async deliverPendingForThread(threadId: number): Promise<void> {
    const rows = await this.outboxRepo.find({
      where: { threadId, status: OUTBOX_STATUS.PENDING },
      order: { id: 'ASC' },
      take: SCAN_LIMIT,
    });
    for (const row of rows) await this.deliver(row);
  }

  private async deliver(row: ChannelOutbox): Promise<void> {
    const thread = await this.threadRepo.findOne({ where: { id: row.threadId } });
    if (!thread) return void (await this.fail(row, 'thread missing', true));

    // Receive-only thread (btbz relay SMS): sending would 400 on every retry.
    if (thread.replyEnabled !== 1) {
      return void (await this.fail(row, 'thread is receive-only', true));
    }

    const channel = await this.channelRepo.findOne({ where: { id: thread.channelId } });
    if (!channel || channel.active !== 1) {
      // Not terminal: an operator re-enabling the channel should drain the queue.
      return void (await this.fail(row, 'channel inactive', false));
    }

    // Idempotency across retries: a mapped outbound row was already delivered.
    const already = await this.mapRepo.findOne({
      where: { messageId: row.messageId, direction: CHANNEL_DIRECTION.OUTBOUND },
    });
    if (already) {
      await this.outboxRepo.update({ id: row.id }, { status: OUTBOX_STATUS.SENT, lastError: null });
      return;
    }

    const message = await this.msgRepo.findOne({ where: { id: row.messageId } });
    if (!message?.body) return void (await this.fail(row, 'message missing', true));

    const adapter = this.registry.find(channel.provider);
    if (!adapter) return void (await this.fail(row, `no adapter for ${channel.provider}`, true));

    try {
      const secret = decryptChannelSecret(channel);
      const result = await adapter.send({ channel, secret }, thread, message.body);
      await this.mapRepo
        .save(
          this.mapRepo.create({
            tenantId: row.tenantId,
            threadId: thread.id,
            externalMessageId: result.externalMessageId || `msg:${row.messageId}`,
            messageId: row.messageId,
            direction: CHANNEL_DIRECTION.OUTBOUND,
          }),
        )
        .catch(() => undefined);
      await this.outboxRepo.update(
        { id: row.id },
        {
          // 'unconfirmed' is not a lesser 'sent' — it means delivery is unproven.
          status: result.unconfirmed ? OUTBOX_STATUS.UNCONFIRMED : OUTBOX_STATUS.SENT,
          externalCommandId: result.unconfirmed ? result.externalMessageId : null,
          lastError: null,
        },
      );
      if (channel.status !== 'connected' || channel.lastError) {
        await this.channelRepo.update({ id: channel.id }, { status: 'connected', lastError: null });
      }
    } catch (e) {
      const reason = (e as Error).message.slice(0, 200);
      await this.fail(row, reason, false);
      await this.channelRepo.update({ id: channel.id }, { status: 'error', lastError: reason });
    }
  }

  private async fail(row: ChannelOutbox, reason: string, terminal: boolean): Promise<void> {
    const attempts = row.attempts + 1;
    const exhausted = terminal || attempts >= MAX_ATTEMPTS;
    if (exhausted) {
      this.logger.warn(`outbox ${row.id} failed permanently after ${attempts}: ${reason}`);
    }
    await this.outboxRepo.update(
      { id: row.id },
      {
        status: exhausted ? OUTBOX_STATUS.FAILED : OUTBOX_STATUS.PENDING,
        attempts,
        lastError: reason,
        nextAttemptAt: exhausted
          ? null
          : new Date(Date.now() + BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)]),
      },
    );
  }
}
