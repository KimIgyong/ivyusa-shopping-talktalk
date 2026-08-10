import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessengerChannel } from './entity/messenger-channel.entity';
import { ChannelThread } from './entity/channel-thread.entity';
import { ChannelMessageMap } from './entity/channel-message-map.entity';
import { ChannelOutbox } from './entity/channel-outbox.entity';
import { Session } from '../session/entity/session.entity';
import { Conversation } from '../chat/entity/conversation.entity';
import { Message } from '../chat/entity/message.entity';
import { MessengerService } from './messenger.service';
import { MessengerIngestService } from './messenger-ingest.service';
import { MessengerOutboxService } from './messenger-outbox.service';
import { MessengerOutboxWorker } from './messenger-outbox.worker';
import { MessengerController } from './messenger.controller';
import { MessengerWebhookController } from './messenger-webhook.controller';
import { AdapterRegistry } from './adapter/adapter.registry';
import { TelegramAdapter } from './adapter/telegram.adapter';
import { ViberAdapter } from './adapter/viber.adapter';
import { ChatModule } from '../chat/chat.module';
import { SessionModule } from '../session/session.module';
import { AuditModule } from '../audit/audit.module';

/**
 * External messenger channels (PLN-260810 PR-M1): Telegram and Viber speak to
 * ShopTalk directly; later phases add hub adapters (AmoebaTalk, btbz relay) and
 * Gmail behind the same port. Chat/Session are imported one-way — nothing in
 * those modules knows this one exists, which keeps the graph acyclic.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      MessengerChannel,
      ChannelThread,
      ChannelMessageMap,
      ChannelOutbox,
      Session,
      Conversation,
      Message,
    ]),
    ChatModule,
    SessionModule,
    AuditModule,
  ],
  controllers: [MessengerController, MessengerWebhookController],
  providers: [
    MessengerService,
    MessengerIngestService,
    MessengerOutboxService,
    MessengerOutboxWorker,
    AdapterRegistry,
    TelegramAdapter,
    ViberAdapter,
  ],
  exports: [MessengerService, MessengerIngestService, MessengerOutboxService, AdapterRegistry],
})
export class MessengerModule {}
