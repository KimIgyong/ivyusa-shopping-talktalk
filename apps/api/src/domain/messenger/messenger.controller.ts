import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal } from '@ivy/types';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { MessengerService } from './messenger.service';
import { MessengerSyncService } from './messenger-sync.service';
import { MessengerMapper } from './messenger.mapper';
import { AdapterRegistry } from './adapter/adapter.registry';
import {
  UpdateMessengerChannelRequest,
  UpsertMessengerChannelRequest,
} from './dto/request/messenger.request';

/** Tenant console API for external messenger channels (PLN-260810 PR-M1). */
@ApiTags('Messenger')
@Controller('messenger/channels')
export class MessengerController {
  constructor(
    private readonly messenger: MessengerService,
    private readonly registry: AdapterRegistry,
    private readonly sync: MessengerSyncService,
  ) {}

  @Get()
  @RequireCapability(CAPABILITY.INTEGRATION_CREDENTIALS_MANAGE)
  @ApiOperation({ summary: 'List this tenant messenger channels (credentials masked)' })
  async list(@CurrentUser() user: Principal) {
    const tenantId = this.tenantId(user);
    const channels = await this.messenger.list(tenantId);
    return {
      // Which providers this build can actually serve — the console renders
      // "coming soon" for the rest instead of offering a dead card.
      supported: this.registry.supported(),
      channels: channels.map((c) =>
        MessengerMapper.toChannelResponse(c, this.messenger.webhookUrl(c)),
      ),
    };
  }

  @Post()
  @RequireCapability(CAPABILITY.INTEGRATION_CREDENTIALS_MANAGE)
  @ApiOperation({ summary: 'Create or replace a messenger channel' })
  async upsert(@CurrentUser() user: Principal, @Body() body: UpsertMessengerChannelRequest) {
    const tenantId = this.tenantId(user);
    const channel = await this.messenger.upsert(tenantId, this.userId(user), {
      provider: body.provider,
      label: body.label,
      secret: body.secret,
      config: body.config,
      autoReply: body.auto_reply,
      consentMode: body.consent_mode,
      active: body.active,
    });
    return MessengerMapper.toChannelResponse(channel, this.messenger.webhookUrl(channel));
  }

  @Patch(':id')
  @RequireCapability(CAPABILITY.INTEGRATION_CREDENTIALS_MANAGE)
  @ApiOperation({ summary: 'Update a messenger channel (label/secret/toggles)' })
  async update(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateMessengerChannelRequest,
  ) {
    const channel = await this.messenger.update(this.tenantId(user), this.userId(user), id, {
      label: body.label,
      secret: body.secret,
      config: body.config,
      autoReply: body.auto_reply,
      consentMode: body.consent_mode,
      active: body.active,
    });
    return MessengerMapper.toChannelResponse(channel, this.messenger.webhookUrl(channel));
  }

  @Delete(':id')
  @RequireCapability(CAPABILITY.INTEGRATION_CREDENTIALS_MANAGE)
  @ApiOperation({ summary: 'Disconnect a messenger channel' })
  async remove(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    await this.messenger.remove(this.tenantId(user), this.userId(user), id);
    return { deleted: true };
  }

  @Post(':id/test')
  @RequireCapability(CAPABILITY.INTEGRATION_CREDENTIALS_MANAGE)
  @ApiOperation({ summary: 'Verify the stored credential against the provider' })
  async test(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    return this.messenger.test(this.tenantId(user), id);
  }

  @Post(':id/sync')
  @RequireCapability(CAPABILITY.INTEGRATION_CREDENTIALS_MANAGE)
  @ApiOperation({ summary: 'Fetch this channel now (does not wait for the poll tick)' })
  async syncNow(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const channel = await this.messenger.require(this.tenantId(user), id);
    const outcome = await this.sync.syncChannel(channel);
    return {
      ...outcome,
      // A disabled channel can still be fetched by hand, but it will not keep
      // syncing — say so rather than let "0 fetched" look like "no messages".
      inactive: channel.active !== 1,
    };
  }

  @Post(':id/register-webhook')
  @RequireCapability(CAPABILITY.INTEGRATION_CREDENTIALS_MANAGE)
  @ApiOperation({ summary: "Register ShopTalk's receive URL with the provider" })
  async registerWebhook(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    return this.messenger.registerWebhook(this.tenantId(user), id);
  }

  /** @RequireCapability admits tenant users only; narrow the union for TS. */
  private tenantId(user: Principal): number {
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return user.tenantId;
  }

  private userId(user: Principal): number {
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return user.userId;
  }
}
