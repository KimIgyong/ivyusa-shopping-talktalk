import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessengerChannel } from './entity/messenger-channel.entity';
import { ChannelThread } from './entity/channel-thread.entity';
import { AdapterRegistry } from './adapter/adapter.registry';
import { ThreadCursor } from './adapter/messenger-adapter';
import { MessengerIngestService } from './messenger-ingest.service';
import { decryptChannelSecret } from './messenger-secret.util';

/** Neither hub exposes an outbound webhook, so freshness comes from this poll. */
const DEFAULT_INTERVAL_SEC = 15;
/** Threads handed to an adapter as cursors — the most recently active ones. */
const CURSOR_LIMIT = 200;

/**
 * Polls every active poll-kind channel (PLN-260810 PR-M2). Same shape as the
 * Cafe24/Shopify schedulers: env-gated interval, `running` guard, unref'd timer.
 *
 * A channel that throws is recorded on its own row and skipped — one broken
 * account must not stop the others from syncing.
 */
@Injectable()
export class MessengerSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessengerSyncService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectRepository(MessengerChannel) private readonly channelRepo: Repository<MessengerChannel>,
    @InjectRepository(ChannelThread) private readonly threadRepo: Repository<ChannelThread>,
    private readonly registry: AdapterRegistry,
    private readonly ingest: MessengerIngestService,
  ) {}

  onModuleInit(): void {
    const seconds = Number(process.env.MESSENGER_SYNC_INTERVAL_SEC ?? DEFAULT_INTERVAL_SEC);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      this.logger.log('Messenger sync disabled (MESSENGER_SYNC_INTERVAL_SEC <= 0)');
      return;
    }
    this.logger.log(`Messenger sync enabled — every ${seconds}s`);
    this.timer = setInterval(() => void this.tick(), seconds * 1000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('previous messenger sync still running — skipping this tick');
      return;
    }
    this.running = true;
    try {
      const channels = await this.channelRepo.find({ where: { active: 1 } });
      for (const channel of channels) {
        const adapter = this.registry.find(channel.provider);
        if (!adapter || adapter.kind !== 'poll' || !adapter.pull) continue;
        await this.syncChannel(channel);
      }
    } finally {
      this.running = false;
    }
  }

  /** Pull one channel and push whatever came back through the shared pipeline. */
  async syncChannel(channel: MessengerChannel): Promise<number> {
    const adapter = this.registry.find(channel.provider);
    if (!adapter?.pull) return 0;

    try {
      const secret = decryptChannelSecret(channel);
      if (!secret) {
        await this.markError(channel, 'credential not set');
        return 0;
      }
      const cursors = await this.cursorsFor(channel.id);
      const inbounds = await adapter.pull({ channel, secret }, cursors);
      if (inbounds.length > 0) {
        await this.ingest.ingestBatch(channel, inbounds);
      }
      await this.channelRepo.update(
        { id: channel.id },
        { lastSyncAt: new Date(), status: 'connected', lastError: null },
      );
      return inbounds.length;
    } catch (e) {
      await this.markError(channel, (e as Error).message);
      return 0;
    }
  }

  private async cursorsFor(channelId: number): Promise<ThreadCursor[]> {
    const threads = await this.threadRepo.find({
      where: { channelId },
      order: { lastInboundAt: 'DESC' },
      take: CURSOR_LIMIT,
      select: { externalThreadId: true, inboundCursor: true, lastInboundAt: true },
    });
    return threads.map((t) => ({
      externalThreadId: t.externalThreadId,
      inboundCursor: t.inboundCursor,
      lastInboundAt: t.lastInboundAt,
    }));
  }

  private async markError(channel: MessengerChannel, message: string): Promise<void> {
    const reason = message.slice(0, 255);
    this.logger.warn(`messenger sync failed (channel ${channel.id}/${channel.provider}): ${reason}`);
    await this.channelRepo.update({ id: channel.id }, { status: 'error', lastError: reason });
  }
}
