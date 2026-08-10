import {
  Controller,
  HttpCode,
  Logger,
  Param,
  Post,
  RawBodyRequest,
  Req,
  HttpStatus,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../global/decorator/public.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { MessengerService } from './messenger.service';
import { MessengerIngestService } from './messenger-ingest.service';
import { AdapterRegistry } from './adapter/adapter.registry';
import { decryptChannelSecret } from './messenger-secret.util';

/**
 * Inbound webhook for direct messenger channels (PLN-260810 PR-M1).
 *
 * The URL token identifies the channel — and therefore the tenant — before any
 * payload is trusted; the adapter then verifies the provider's own proof
 * (Telegram secret header, Viber HMAC). Both fail CLOSED.
 */
@ApiTags('Webhooks')
// External providers burst from a single IP; the signature check above is the
// real gate, so the global flood limit must not drop legitimate deliveries.
@SkipThrottle()
@Controller('webhooks/messenger')
export class MessengerWebhookController {
  private readonly logger = new Logger(MessengerWebhookController.name);

  constructor(
    private readonly messenger: MessengerService,
    private readonly ingest: MessengerIngestService,
    private readonly registry: AdapterRegistry,
  ) {}

  @Post(':provider/:token')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Receive a messenger platform delivery (Telegram/Viber)' })
  async receive(
    @Param('provider') provider: string,
    @Param('token') token: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const channel = await this.messenger.findActiveByWebhookToken(provider, token);
    if (!channel) {
      // 4xx are not server-logged by default — say so, or this looks like silence.
      this.logger.warn(`messenger webhook rejected: unknown/inactive token (provider ${provider})`);
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.UNAUTHORIZED);
    }

    const adapter = this.registry.require(channel.provider);
    if (!adapter.parse) {
      this.logger.warn(`messenger webhook rejected: ${channel.provider} is not a webhook channel`);
      throw new BusinessException(ERROR_CODE.MESSENGER_PROVIDER_UNSUPPORTED, HttpStatus.BAD_REQUEST);
    }

    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');
    const secret = decryptChannelSecret(channel);
    // Throws 401 on a bad signature — the adapter owns that decision.
    const inbounds = adapter.parse({ channel, secret }, lowerHeaders(req), raw);

    // Answer first: providers retry (and Telegram backs off) when we hold the
    // connection open for RAG + moderation, which takes seconds.
    if (inbounds.length > 0) {
      setImmediate(() => {
        void this.ingest.ingestBatch(channel, inbounds).catch((e) => {
          this.logger.error(`ingest batch failed (channel ${channel.id}): ${(e as Error).message}`);
        });
      });
    }
    return { ok: true };
  }
}

function lowerHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') out[key.toLowerCase()] = value;
    else if (Array.isArray(value) && value.length) out[key.toLowerCase()] = value[0];
  }
  return out;
}
