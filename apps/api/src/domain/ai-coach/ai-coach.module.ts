import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoachingThread } from './entity/coaching-thread.entity';
import { CoachingMessage } from './entity/coaching-message.entity';
import { CoachingProposal } from './entity/coaching-proposal.entity';
import { Message } from '../chat/entity/message.entity';
import { AiCoachService } from './ai-coach.service';
import { CoachContextService } from './coach-context.service';
import { CoachProposalService } from './coach-proposal.service';
import { AiCoachController } from './ai-coach.controller';
import { ChatModule } from '../chat/chat.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { AiEngineModule } from '../ai-engine/ai-engine.module';
import { ModerationModule } from '../moderation/moderation.module';
import { AuditModule } from '../audit/audit.module';

/**
 * Agent coaching (FR-071..073). Depends on Chat for RagService (KB retrieval)
 * and AiEngine for the tenant config it proposes changes to. Nothing depends on
 * this module, so those imports stay acyclic.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CoachingThread, CoachingMessage, CoachingProposal, Message]),
    ChatModule,
    KnowledgeModule,
    AiEngineModule,
    ModerationModule,
    AuditModule,
  ],
  controllers: [AiCoachController],
  providers: [AiCoachService, CoachContextService, CoachProposalService],
  exports: [AiCoachService],
})
export class AiCoachModule {}
