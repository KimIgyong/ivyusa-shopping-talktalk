import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Issue } from './entity/issue.entity';
import { IssueEvent } from './entity/issue-event.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { Message } from '../chat/entity/message.entity';
import { Assignment } from '../agent/entity/assignment.entity';
import { Conversation } from '../chat/entity/conversation.entity';
import { Session } from '../session/entity/session.entity';
import { Customer } from '../customer/entity/customer.entity';
import { User } from '../user/entity/user.entity';
import { TenantAiConfig } from '../ai-engine/entity/tenant-ai-config.entity';
import { OrderCache } from '../order/entity/order-cache.entity';
import { IntegrationCredential } from '../tenant/entity/integration-credential.entity';
import { ExternalTicket } from './entity/external-ticket.entity';
import { IssueService } from './issue.service';
import { IssueController } from './issue.controller';
import { IssuePublicController } from './issue-public.controller';
import { GorgiasWebhookController } from './gorgias-webhook.controller';
import { ExternalTicketService } from './external-ticket.service';
import { AuditModule } from '../audit/audit.module';
import { ModerationModule } from '../moderation/moderation.module';

/**
 * Issue workflow P1 (PLN-260808-Issue-Workflow-P1): escalated conversations are
 * promoted to 1:1 tickets for native-mode tenants. Creation subscribes to the
 * ESCALATION bus event; Agent/Chat call the accept/end hooks. Entity-only
 * imports from tenant/chat keep the module graph acyclic.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Issue,
      IssueEvent,
      Tenant,
      Message,
      Assignment,
      Conversation,
      Session,
      Customer,
      User,
      TenantAiConfig,
      OrderCache,
      IntegrationCredential,
      ExternalTicket,
    ]),
    AuditModule,
    // L3 relay moderates external agent replies before they reach the widget.
    ModerationModule,
  ],
  controllers: [IssueController, IssuePublicController, GorgiasWebhookController],
  providers: [IssueService, ExternalTicketService],
  exports: [IssueService],
})
export class IssueModule {}
