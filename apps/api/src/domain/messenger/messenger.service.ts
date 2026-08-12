import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { MESSENGER_FIELDS, MESSENGER_MODE, MESSENGER_PROVIDER, type MessengerProvider } from '@ivy/types';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { AuditService } from '../audit/audit.service';
import { MessengerChannel } from './entity/messenger-channel.entity';
import { AdapterRegistry } from './adapter/adapter.registry';
import { autoReplyFlagFor, REPLY_MODE } from './auto-reply.util';
import { TestResult } from './adapter/messenger-adapter';
import {
  encryptChannelSecret,
  decryptChannelSecret,
  decryptChannelSecretFields,
} from './messenger-secret.util';

/** Providers reached through an aggregator rather than their own API. */
const HUB_PROVIDERS: string[] = [MESSENGER_PROVIDER.AMOEBATALK, MESSENGER_PROVIDER.BTBZ_RELAY];

export interface UpsertChannelInput {
  provider: string;
  label: string;
  secret?: Record<string, string>;
  config?: Record<string, unknown>;
  autoReply?: boolean;
  replyMode?: string;
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

  async list(tenantId: number): Promise<MessengerChannel[]> {
    const channels = await this.channelRepo.find({
      where: { tenantId },
      order: { provider: 'ASC', label: 'ASC' },
    });
    for (const channel of channels) await this.hoistLegacyFields(channel);
    return channels;
  }

  async require(tenantId: number, id: number): Promise<MessengerChannel> {
    const channel = await this.channelRepo.findOne({ where: { id, tenantId } });
    if (!channel) {
      throw new BusinessException(ERROR_CODE.MESSENGER_CHANNEL_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    await this.hoistLegacyFields(channel);
    return channel;
  }

  /**
   * Move non-secret fields of channels saved before the config/secret split out
   * of the encrypted blob and into `config`, once, on first read.
   *
   * Without it an existing channel keeps showing blank inputs — which is how
   * the original report ("account email didn't save") happened: the value was
   * there, just unreadable. The blob is left as is; adapters prefer config, and
   * rewriting a credential to fix a display bug is not worth the risk.
   */
  private async hoistLegacyFields(channel: MessengerChannel): Promise<void> {
    const specs = MESSENGER_FIELDS[channel.provider as MessengerProvider] ?? [];
    const plainKeys = specs.filter((f) => !f.secret).map((f) => f.key);
    if (plainKeys.length === 0 || !channel.secretEnc) return;

    let stored: Record<string, string>;
    try {
      stored = decryptChannelSecretFields(channel);
    } catch {
      return; // unreadable blob (rotated key) — nothing to hoist
    }

    const config = { ...(channel.config ?? {}) } as MessengerChannel['config'] & object;
    let moved = false;
    for (const key of plainKeys) {
      const value = stored[key];
      if (typeof value === 'string' && value.trim() && config[key] === undefined) {
        config[key] = value.trim();
        moved = true;
      }
    }
    if (!moved) return;

    channel.config = config;
    await this.channelRepo.update({ id: channel.id }, { config });
    this.logger.log(`channel ${channel.id}: hoisted legacy field(s) into config`);
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

    const split = splitFields(input.provider, input.secret, input.config);
    if (split.secret) channel.secretEnc = encryptChannelSecret(split.secret);
    if (split.config) channel.config = { ...(channel.config ?? {}), ...split.config };
    // `reply_mode` is the real setting; `auto_reply` is mirrored so rolling the
    // code back keeps the old boolean meaningful (PLN-260812 D-1).
    if (input.replyMode !== undefined) {
      channel.replyMode = input.replyMode;
      channel.autoReply = autoReplyFlagFor(input.replyMode);
    } else if (input.autoReply !== undefined) {
      channel.autoReply = input.autoReply ? 1 : 0;
      channel.replyMode = input.autoReply ? REPLY_MODE.AUTO : REPLY_MODE.OFF;
    }
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
    const split = splitFields(channel.provider, patch.secret, patch.config);
    if (split.secret) channel.secretEnc = encryptChannelSecret(split.secret);
    if (split.config) channel.config = { ...(channel.config ?? {}), ...split.config };
    if (patch.replyMode !== undefined) {
      channel.replyMode = patch.replyMode;
      channel.autoReply = autoReplyFlagFor(patch.replyMode);
    } else if (patch.autoReply !== undefined) {
      channel.autoReply = patch.autoReply ? 1 : 0;
      channel.replyMode = patch.autoReply ? REPLY_MODE.AUTO : REPLY_MODE.OFF;
    }
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
 * Route each submitted field to where it belongs, by the provider's own schema
 * rather than by what the client happened to send.
 *
 * Only `secret: true` fields are encrypted. The rest (mailbox address, server
 * URL, IMAP/SMTP host) go to `config`, which the console reads back — keeping
 * them in the write-only blob meant an operator reopened the form to blank
 * inputs and could not see what a channel was actually pointed at.
 */
function splitFields(
  provider: string,
  submitted: Record<string, string> | undefined,
  config: Record<string, unknown> | undefined,
): { secret?: string | Record<string, string>; config?: Record<string, unknown> } {
  const specs = MESSENGER_FIELDS[provider as MessengerProvider] ?? [];
  const secretKeys = new Set(specs.filter((f) => f.secret).map((f) => f.key));

  const secrets: Record<string, string> = {};
  const plain: Record<string, unknown> = { ...(config ?? {}) };
  for (const [key, value] of Object.entries(submitted ?? {})) {
    if (typeof value !== 'string' || value.trim() === '') continue;
    if (secretKeys.has(key)) secrets[key] = value.trim();
    // Unknown keys land in config too: better visible than silently dropped.
    else plain[key] = value.trim();
  }

  const entries = Object.entries(secrets);
  return {
    // A lone secret is stored bare so adapters can use `ctx.secret` directly.
    secret: entries.length === 0 ? undefined : entries.length === 1 ? entries[0][1] : secrets,
    config: Object.keys(plain).length > 0 || config !== undefined ? plain : undefined,
  };
}
