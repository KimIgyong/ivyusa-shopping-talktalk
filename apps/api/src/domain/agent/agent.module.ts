import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Agent } from './entity/agent.entity';
import { AgentProfile } from './entity/agent-profile.entity';
import { Assignment } from './entity/assignment.entity';
import { AgentDailyStat } from './entity/agent-daily-stat.entity';
import { AgentAlert } from './entity/agent-alert.entity';
import { Conversation } from '../chat/entity/conversation.entity';
import { Message } from '../chat/entity/message.entity';
import { User } from '../user/entity/user.entity';
import { Session } from '../session/entity/session.entity';
import { AgentService } from './agent.service';
import { AgentAlertService } from './agent-alert.service';
import { AgentConsoleController } from './agent-console.controller';
import { ModerationModule } from '../moderation/moderation.module';
import { CustomerModule } from '../customer/customer.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Agent,
      AgentProfile,
      Assignment,
      AgentDailyStat,
      AgentAlert,
      Conversation,
      Message,
      User,
      Session,
    ]),
    ModerationModule,
    CustomerModule,
  ],
  controllers: [AgentConsoleController],
  providers: [AgentService, AgentAlertService],
  exports: [AgentService, AgentAlertService],
})
export class AgentModule {}
