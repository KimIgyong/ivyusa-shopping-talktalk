import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Agent } from './entity/agent.entity';
import { AgentProfile } from './entity/agent-profile.entity';
import { Assignment } from './entity/assignment.entity';
import { AgentDailyStat } from './entity/agent-daily-stat.entity';
import { Conversation } from '../chat/entity/conversation.entity';
import { Message } from '../chat/entity/message.entity';
import { User } from '../user/entity/user.entity';
import { Session } from '../session/entity/session.entity';
import { AgentService } from './agent.service';
import { AgentConsoleController } from './agent-console.controller';
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Agent,
      AgentProfile,
      Assignment,
      AgentDailyStat,
      Conversation,
      Message,
      User,
      Session,
    ]),
    ModerationModule,
  ],
  controllers: [AgentConsoleController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
