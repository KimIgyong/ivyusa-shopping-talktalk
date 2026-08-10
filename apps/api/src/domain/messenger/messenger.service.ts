import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { MESSENGER_MODE, MESSENGER_PROVIDER } from '@ivy/types';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { AuditService } from '../audit/audit.service';
import { MessengerChannel } from './entity/messenger-channel.entity';
import { AdapterRegistry } from './adapter/adapter.registry';
import { TestResult } from './adapter/messenger-adapter';
import { encryptChannelSecret, decryptChannelSecret } from './messenger-secret.util';

/** Providers reached through an aggregator rather than their own API. */
const HUB_PROVIDERS: string[] = [MESSENGER_PROVIDER.AMOEBATALK, MESSENGER_PROVIDER.BTBZ_RELAY];

export interface UpsertChannelInput {
  provider: string;
  label: string;
  secret?: Record<string, string>;
  config?: Record<string, unknown>;
  autoReply?: boolean;
  consentMode?: string;
  active?: boolean;
}

/**
 * Channel registry: credentials, activation and connection tests
 * (PLN-260810 PR-M1). Tenant-scoped throughout — every lookup filters by
 * tenant, so a channel id from another tenant reads as "not found".
 */
@Injectable()
export class MessengerService {
  private readonly logger = new Logger(MessengerService.name);

  constructor(
    @InjectRepository(MessengerChannel) private readonly channelRepo: Repository<MessengerChannel>,
    private readonly registry: AdapterRegistry,
    private readonly audit: AuditService,
  ) {}

  list(tenantId: number): Promise<MessengerChannel[]> {
    return this.channelRepo.find({ where: { tenantId }, order: { provider: 'ASC', label: 'ASC' } });
  }

  async require(tenantId: number, id: number): Promise<MessengerChannel> {
    const channel = await this.channelRepo.findOne({ where: { id, tenantId } });
    if (!channel) {
      throw new BusinessException(ERROR_CODE.MESSENGER_CHANNEL_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    return channel;
  }

  /** Active channel for an inbound webhook token — the tenant resolves from it. */
  async findActiveByWebhookToken(provider: string, token: string): Promise<MessengerChannel | null> {
    if (!token) return null;
    return this.channelRepo.findOne({ where: { provider, webhookToken: token, active: 1 } });
  }

  async upsert(tenantId: number, userId: number, input: UpsertChannelInput): Promise<MessengerChannel> {
    const adapter = this.registry.require(input.provider);
    const existing = await this.channelRepo.findOne({
      where: { tenantId, provider: input.provider, label: input.label },
    });

    const channel =
      existing ??
      this.channelRepo.create({
        tenantId,
        provider: input.provider,
        label: input.label,
        mode: HUB_PROVIDERS.includes(input.provider) ? MESSENGER_MODE.HUB : MESSENGER_MODE.DIRECT,
        // Webhook channels need a routing token from the start: it is part of
        // the receive URL the operator copies before the first delivery.
        webhookToken: adapter.kind === 'webhook' ? randomBytes(24).toString('hex') : null,
      });

    if (input.secret && Object.keys(input.secret).length > 0) {
      channel.secretEnc = encryptChannelSecret(normalizeSecret(input.secret));
    }
    if (input.config !== undefined) channel.config = input.config;
    if (input.autoReply !== undefined) channel.autoReply = input.autoReply ? 1 : 0;
    if (input.consentMode !== undefined) channel.consentMode = input.consentMode;
    if (input.active !== undefined) channel.active = input.active ? 1 : 0;

    const saved = await this.channelRepo.save(channel);
    await this.audit.write({
      tenantId,
      actorType: 'user',
      actorId: userId,
      action: existing ? 'messenger.channel.update' : 'messenger.channel.create',
      target: `messenger_channel:${saved.id}`,
      metadata: { provider: saved.provider, label: saved.label, active: saved.active === 1 },
    });
    return saved;
  }

  async update(
    tenantId: number,
    userId: number,
    id: number,
    patch: Partial<UpsertChannelInput>,
  ): Promise<MessengerChannel> {
    const channel = await this.require(tenantId, id);
    if (patch.label !== undefined) channel.label = patch.label;
    if (patch.secret && Object.keys(patch.secret).length > 0) {
      channel.secretEnc = encryptChannelSecret(normalizeSecret(patch.secret));
    }
    if (patch.config !== undefined) channel.config = patch.config;
    if (patch.autoReply !== undefined) channel.autoReply = patch.autoReply ? 1 : 0;
    if (patch.consentMode !== undefined) channel.consentMode = patch.consentMode;
    if (patch.active !== undefined) channel.active = patch.active ? 1 : 0;

    const saved = await this.channelRepo.save(channel);
    await this.audit.write({
      tenantId,
      actorType: 'user',
      actorId: userId,
      action: 'messenger.channel.update',
      target: `messenger_channel:${saved.id}`,
      metadata: { provider: saved.provider, active: saved.active === 1 },
    });
    return saved;
  }

  async remove(tenantId: number, userId: number, id: number): Promise<void> {
    const channel = await this.require(tenantId, id);
    await this.channelRepo.delete({ id: channel.id });
    await this.audit.write({
      tenantId,
      actorType: 'user',
      actorId: userId,
      action: 'messenger.channel.delete',
      target: `messenger_channel:${id}`,
      metadata: { provider: channel.provider, label: channel.label },
    });
  }

  /** Credential check; records the outcome on the channel so the card shows it. */
  async test(tenantId: number, id: number): Promise<TestResult> {
    const channel = await this.require(tenantId, id);
    const adapter = this.registry.require(channel.provider);
    const secret = decryptChannelSecret(channel);
    if (!secret) {
      await this.channelRepo.update(
        { id: channel.id },
        { status: 'error', lastError: 'credential not set' },
      );
      throw new BusinessException(ERROR_CODE.MESSENGER_CREDENTIAL_MISSING, HttpStatus.BAD_REQUEST);
    }

    const result = await adapter.test({ channel, secret });
    await this.channelRepo.update(
      { id: channel.id },
      {
        status: result.ok ? 'connected' : 'error',
        lastError: result.ok ? null : result.detail.slice(0, 255),
        externalAccountId: result.accountId ?? channel.externalAccountId,
      },
    );
    return result;
  }

  /**
   * Hand our receive URL to the provider (Telegram setWebhook / Viber
   * set_webhook). Called on demand from the console and on activation.
   */
  async registerWebhook(tenantId: number, id: number): Promise<{ webhookUrl: string }> {
    const channel = await this.require(tenantId, id);
    const adapter = this.registry.require(channel.provider);
    const url = this.webhookUrl(channel);
    if (!adapter.register || !url) {
      throw new BusinessException(ERROR_CODE.MESSENGER_PROVIDER_UNSUPPORTED, HttpStatus.BAD_REQUEST);
    }
    const secret = decryptChannelSecret(channel);
    if (!secret) {
      throw new BusinessException(ERROR_CODE.MESSENGER_CREDENTIAL_MISSING, HttpStatus.BAD_REQUEST);
    }
    try {
      await adapter.register({ channel, secret }, url);
    } catch (e) {
      const reason = (e as Error).message.slice(0, 255);
      await this.channelRepo.update({ id: channel.id }, { status: 'error', lastError: reason });
      this.logger.warn(`webhook registration failed (channel ${channel.id}): ${reason}`);
      throw new BusinessException(ERROR_CODE.EXTERNAL_SERVICE_ERROR, HttpStatus.BAD_GATEWAY);
    }
    await this.channelRepo.update({ id: channel.id }, { status: 'connected', lastError: null });
    return { webhookUrl: url };
  }

  /** Public receive URL for a webhook channel, or null when it has no token. */
  webhookUrl(channel: MessengerChannel): string | null {
    if (!channel.webhookToken) return null;
    const base = (
      process.env.MESSENGER_WEBHOOK_BASE_URL ??
      process.env.SHOPIFY_APP_URL ??
      'http://localhost:3000'
    ).replace(/\/+$/, '');
    const prefix = (process.env.API_PREFIX ?? 'api/v1').replace(/^\/+|\/+$/g, '');
    return `${base}/${prefix}/webhooks/messenger/${channel.provider}/${channel.webhookToken}`;
  }

  async markSynced(channelId: number): Promise<void> {
    await this.channelRepo.update({ id: channelId }, { lastSyncAt: new Date() });
  }
}

/**
 * Single-field credentials (bot token, auth token) are stored bare so adapters
 * can use `ctx.secret` directly; multi-field ones keep their JSON shape.
 */
function normalizeSecret(secret: Record<string, string>): string | Record<string, string> {
  const entries = Object.entries(secret).filter(([, v]) => typeof v === 'string' && v.trim() !== '');
  if (entries.length === 1) return entries[0][1].trim();
  return Object.fromEntries(entries.map(([k, v]) => [k, v.trim()]));
}
