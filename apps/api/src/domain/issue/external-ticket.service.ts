import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { SENDER_TYPE } from '@ivy/types';
import { ExternalTicket } from './entity/external-ticket.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { Message } from '../chat/entity/message.entity';
import { Session } from '../session/entity/session.entity';
import { Customer } from '../customer/entity/customer.entity';
import { OrderCache } from '../order/entity/order-cache.entity';
import { IntegrationCredential } from '../tenant/entity/integration-credential.entity';
import { blindIndex, decryptSecret } from '../../global/util/crypto.util';
import { EventBusService, EVENTS } from '../../infrastructure/infrastructure.module';
import {
  appendGorgiasMessage,
  createGorgiasTicket,
  GorgiasConfig,
  GorgiasMessage,
} from './gorgias.client';

const PROVIDER = 'gorgias';
const TRANSCRIPT_CAP = 100;

interface EscalationLike {
  tenantId?: number;
  conversationId?: number;
  sessionId?: number;
  reason?: string;
}

/**
 * Gorgias L1 connector (PLN-260808-Issue-Workflow-P2 S4, 결정 11·13): a
 * bridge-mode tenant's escalation becomes an external Gorgias ticket carrying
 * the full transcript + reason (+ recent-order note). Mode exclusivity (§11.1)
 * is structural — native/base tenants no-op here, bridge tenants no-op in
 * IssueService. Re-escalations append to the existing ticket via the message
 * cursor (open/closed split arrives with the L2 webhook, 결정 12). Best-effort
 * with one retry — a connector failure never breaks the escalation itself.
 */
@Injectable()
export class ExternalTicketService implements OnModuleInit {
  private readonly logger = new Logger(ExternalTicketService.name);

  constructor(
    @InjectRepository(ExternalTicket) private readonly extRepo: Repository<ExternalTicket>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Message) private readonly msgRepo: Repository<Message>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    @InjectRepository(OrderCache) private readonly orderRepo: Repository<OrderCache>,
    @InjectRepository(IntegrationCredential)
    private readonly credRepo: Repository<IntegrationCredential>,
    private readonly bus: EventBusService,
  ) {}

  onModuleInit(): void {
    this.bus.subscribe(EVENTS.ESCALATION, async (payload: unknown) => {
      try {
        await this.relayEscalation((payload ?? {}) as EscalationLike);
      } catch (e) {
        this.logger.warn(`gorgias relay failed: ${(e as Error).message}`);
      }
    });
  }

  async relayEscalation(payload: EscalationLike): Promise<void> {
    const { tenantId, conversationId, sessionId } = payload;
    if (!tenantId || !conversationId || !sessionId) return;
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (tenant?.workflowMode !== 'bridge') return;
    const cfg = await this.gorgiasConfig(tenantId);
    if (!cfg) {
      this.logger.warn(`bridge tenant ${tenantId} has no usable gorgias credentials — relay skipped`);
      return;
    }
    // Gorgias dedups/threads customers by email — without one we cannot file a
    // ticket that routes anywhere useful (REQ §11.2.1).
    const email = await this.customerEmail(tenantId, sessionId);
    if (!email) {
      this.logger.warn(`gorgias relay skipped: no customer email (conversation=${conversationId})`);
      return;
    }

    const existing = await this.extRepo.findOne({ where: { conversationId, provider: PROVIDER } });
    if (existing) {
      await this.appendNewMessages(cfg, existing, email);
      return;
    }
    await this.createTicket(cfg, tenantId, conversationId, email, payload.reason ?? 'escalation');
  }

  /* ------------------------------ internals ------------------------------ */

  private async createTicket(
    cfg: GorgiasConfig,
    tenantId: number,
    conversationId: number,
    email: string,
    reason: string,
  ): Promise<void> {
    const transcript = await this.msgRepo.find({
      where: { conversationId },
      order: { id: 'ASC' },
      take: TRANSCRIPT_CAP,
    });
    if (!transcript.length) return;
    const messages: GorgiasMessage[] = transcript.map((m) => ({
      // Customer turns come from the shopper; ai/agent/system are our side.
      fromAgent: m.senderType !== SENDER_TYPE.USER,
      bodyText: m.body,
      createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : undefined,
    }));
    const orderNote = await this.orderNote(tenantId, email);
    if (orderNote) messages.push({ fromAgent: true, bodyText: orderNote });

    const lastUser = [...transcript].reverse().find((m) => m.senderType === SENDER_TYPE.USER);
    const subject = `[ShopTalk] ${reason} — ${(lastUser?.body ?? 'chat escalation').slice(0, 80)}`;
    const externalId = await this.withRetry(() =>
      createGorgiasTicket(cfg, {
        customerEmail: email,
        subject,
        messages,
        tags: ['shoptalk', reason],
      }),
    );
    await this.extRepo.save(
      this.extRepo.create({
        tenantId,
        conversationId,
        provider: PROVIDER,
        externalId,
        lastRelayedMessageId: transcript[transcript.length - 1]?.id ?? null,
      }),
    );
    this.logger.log(
      `gorgias ticket ${externalId} created (tenant=${tenantId} conversation=${conversationId})`,
    );
  }

  /** Re-escalation: relay customer messages newer than the cursor (결정 12 L1). */
  private async appendNewMessages(
    cfg: GorgiasConfig,
    ref: ExternalTicket,
    email: string,
  ): Promise<void> {
    const fresh = await this.msgRepo.find({
      where: {
        conversationId: ref.conversationId,
        senderType: SENDER_TYPE.USER,
        ...(ref.lastRelayedMessageId != null ? { id: MoreThan(ref.lastRelayedMessageId) } : {}),
      },
      order: { id: 'ASC' },
      take: 20,
    });
    if (!fresh.length) return;
    const body = fresh.map((m) => m.body).join('\n\n');
    await this.withRetry(() =>
      appendGorgiasMessage(cfg, ref.externalId, email, { fromAgent: false, bodyText: body }),
    );
    ref.lastRelayedMessageId = fresh[fresh.length - 1].id;
    await this.extRepo.save(ref);
    this.logger.log(`gorgias ticket ${ref.externalId} appended ${fresh.length} message(s)`);
  }

  private async gorgiasConfig(tenantId: number): Promise<GorgiasConfig | null> {
    const cred = await this.credRepo.findOne({ where: { tenantId, provider: PROVIDER } });
    if (!cred?.secretEnc) return null;
    try {
      const parsed = JSON.parse(decryptSecret(cred.secretEnc)) as Record<string, string>;
      if (!parsed.subdomain || !parsed.email || !parsed.api_key) return null;
      return { subdomain: parsed.subdomain, email: parsed.email, apiKey: parsed.api_key };
    } catch {
      return null;
    }
  }

  private async customerEmail(tenantId: number, sessionId: number): Promise<string | null> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session?.customerId) return null;
    const customer = await this.customerRepo.findOne({
      where: { id: session.customerId, tenantId },
    });
    return customer?.email?.trim() || null;
  }

  /** Recent-order context as an internal-style note (§11.2 packaging). */
  private async orderNote(tenantId: number, email: string): Promise<string | null> {
    try {
      // Email is encrypted at rest — equality goes through the blind index (PRV-M6).
      const customer = await this.customerRepo.findOne({
        where: { tenantId, emailHash: blindIndex(email) ?? '__none__' },
      });
      if (!customer) return null;
      const orders = await this.orderRepo.find({
        where: { tenantId, customerId: customer.id },
        order: { id: 'DESC' },
        take: 3,
      });
      if (!orders.length) return null;
      const lines = orders.map(
        (o) => `#${o.orderNumber} · ${o.statusUi ?? o.statusInternal ?? '-'} · ${o.total ?? '-'} ${o.currency ?? ''}`,
      );
      return `[ShopTalk] Recent orders:\n${lines.join('\n')}`;
    } catch {
      return null;
    }
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch {
      return fn();
    }
  }
}
