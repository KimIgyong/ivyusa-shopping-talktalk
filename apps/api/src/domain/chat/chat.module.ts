import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from './entity/conversation.entity';
import { Message } from './entity/message.entity';
import { Session } from '../session/entity/session.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { User } from '../user/entity/user.entity';
import { KbDocument } from '../knowledge/entity/kb-document.entity';
import { ChatService } from './chat.service';
import { RagService } from './rag.service';
import { ScenarioService } from './scenario.service';
import { ChatController } from './chat.controller';
import { SessionModule } from '../session/session.module';
import { ModerationModule } from '../moderation/moderation.module';
import { AiEngineModule } from '../ai-engine/ai-engine.module';
import { OrderModule } from '../order/order.module';
import { CustomerModule } from '../customer/customer.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message, Session, Tenant, User, KbDocument]),
    SessionModule,
    ModerationModule,
    AiEngineModule,
    // OrderService grounds order questions in the customer's real orders. Order
    // does not depend on Chat, so this stays acyclic.
    OrderModule,
    // CustomerService stores the off-hours contact address through the same
    // lead path (erasure suppression + encryption) the agent console uses.
    CustomerModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, RagService, ScenarioService],
  exports: [ChatService, RagService, ScenarioService],
})
export class ChatModule {}
