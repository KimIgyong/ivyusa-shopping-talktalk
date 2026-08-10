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
import { AmoebaTalkHubAdapter } from './adapter/amoeba-talk-hub.adapter';
import { BtbzRelayAdapter } from './adapter/btbz-relay.adapter';
import { MessengerSyncService } from './messenger-sync.service';
import { ChatModule } from '../chat/chat.module';
import { SessionModule } from '../session/session.module';
import { AuditModule } from '../audit/audit.module';

/**
 * External messenger channels (PLN-260810). Telegram and Viber speak to
 * ShopTalk directly over webhooks (PR-M1); AmoebaTalk is polled as a hub so its
 * already-certified Zalo/LINE/WhatsApp channels come for free (PR-M2); the btbz
 * KSR relay adds KakaoTalk rooms and inbound SMS (PR-M3). Gmail follows behind
 * the same port. Chat/Session are imported one-way — nothing there knows this
 * module exists, so the graph stays acyclic.
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
    MessengerSyncService,
    AdapterRegistry,
    TelegramAdapter,
    ViberAdapter,
    AmoebaTalkHubAdapter,
    BtbzRelayAdapter,
  ],
  exports: [
    MessengerService,
    MessengerIngestService,
    MessengerOutboxService,
    MessengerSyncService,
    AdapterRegistry,
  ],
})
export class MessengerModule {}
