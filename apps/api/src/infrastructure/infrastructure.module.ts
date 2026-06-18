import { Global, Module } from '@nestjs/common';
import { RedisService } from './cache/redis.service';
import { EventBusService } from './queue/event-bus.service';

// Re-export infra services so domains can import them from this barrel.
export { RedisService } from './cache/redis.service';
export { EventBusService } from './queue/event-bus.service';

/** Global infrastructure: cache + event bus, available to every domain module. */
@Global()
@Module({
  providers: [RedisService, EventBusService],
  exports: [RedisService, EventBusService],
})
export class InfrastructureModule {}

/** Routing keys for the event bus (single source of truth). */
export const EVENTS = {
  CJM: 'cjm.event',
  NOTIFICATION: 'notification.event',
  CONVERSATION_LOG: 'conversation.log',
  WEBHOOK_FULFILLMENT: 'webhook.fulfillment',
  CAMPAIGN_DISPATCH: 'campaign.dispatch',
  ESCALATION: 'escalation.requested',
} as const;
