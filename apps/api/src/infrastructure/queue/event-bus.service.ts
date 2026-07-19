import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

export type EventHandler = (payload: unknown) => void | Promise<void>;

/**
 * Async event bus (SEQ-05/08 notification, FN-046 logging, FN-047 CJM).
 * Publishes to RabbitMQ when reachable; always also dispatches to in-process
 * subscribers so flows work in local dev without the broker. At-least-once intent;
 * handlers must be idempotent.
 */
@Injectable()
export class EventBusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventBusService.name);
  private readonly exchange = 'ivy.events';
  private conn: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private readonly handlers = new Map<string, EventHandler[]>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('RABBITMQ_URL');
    if (!url) return;
    try {
      this.conn = await amqp.connect(url);
      this.channel = await this.conn.createChannel();
      await this.channel.assertExchange(this.exchange, 'topic', { durable: true });
      this.logger.log('RabbitMQ connected');
    } catch (e) {
      this.logger.warn(`RabbitMQ unavailable, using in-process bus: ${(e as Error).message}`);
    }
  }

  /** Register an in-process subscriber for a routing key (topic). */
  subscribe(routingKey: string, handler: EventHandler): void {
    const list = this.handlers.get(routingKey) ?? [];
    list.push(handler);
    this.handlers.set(routingKey, list);
  }

  /**
   * Publish an event. In-process handlers are dispatched DETACHED from the
   * caller (PERF-3): a chat turn no longer pays for CJM inserts, notification
   * fan-out, or the escalation Slack/SMTP calls inside its HTTP response.
   * Handler errors are logged, never propagated to the publisher.
   */
  async publish(routingKey: string, payload: unknown): Promise<void> {
    const body = Buffer.from(JSON.stringify(payload));
    try {
      this.channel?.publish(this.exchange, routingKey, body, { persistent: true });
    } catch (e) {
      this.logger.warn(`publish failed (${routingKey}): ${(e as Error).message}`);
    }
    // In-process fan-out (supports wildcard prefix "a.b.*"), off the hot path.
    setImmediate(() => {
      for (const [key, handlers] of this.handlers.entries()) {
        if (this.matches(key, routingKey)) {
          for (const h of handlers) {
            Promise.resolve()
              .then(() => h(payload))
              .catch((e) =>
                this.logger.error(`handler error (${key}): ${(e as Error).message}`),
              );
          }
        }
      }
    });
  }

  private matches(pattern: string, key: string): boolean {
    if (pattern === key) return true;
    if (pattern.endsWith('.*')) return key.startsWith(pattern.slice(0, -1));
    return false;
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.conn?.close().catch(() => undefined);
  }
}
