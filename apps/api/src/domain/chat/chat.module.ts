import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from './entity/conversation.entity';
import { Message } from './entity/message.entity';
import { Session } from '../session/entity/session.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { KbDocument } from '../knowledge/entity/kb-document.entity';
import { ChatService } from './chat.service';
import { RagService } from './rag.service';
import { ScenarioService } from './scenario.service';
import { ChatController } from './chat.controller';
import { SessionModule } from '../session/session.module';
import { ModerationModule } from '../moderation/moderation.module';
import { AiEngineModule } from '../ai-engine/ai-engine.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message, Session, Tenant, KbDocument]),
    SessionModule,
    ModerationModule,
    AiEngineModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, RagService, ScenarioService],
  exports: [ChatService, RagService, ScenarioService],
})
export class ChatModule {}
