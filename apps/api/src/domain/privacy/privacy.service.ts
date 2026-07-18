import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SESSION_IDENTITY } from '@ivy/types';
import { Customer } from '../customer/entity/customer.entity';
import { Session } from '../session/entity/session.entity';
import { OrderCache } from '../order/entity/order-cache.entity';
import { OrderItem } from '../order/entity/order-item.entity';
import { Fulfillment } from '../order/entity/fulfillment.entity';
import { Conversation } from '../chat/entity/conversation.entity';
import { Message } from '../chat/entity/message.entity';
import { Notification } from '../notification/entity/notification.entity';
import { NotificationPref } from '../notification/entity/notification-pref.entity';
import { Review } from '../review/entity/review.entity';
import { Inquiry } from '../inquiry/entity/inquiry.entity';
import { CjmEvent } from '../cjm/entity/cjm-event.entity';
import { Affiliate } from '../affiliate/entity/affiliate.entity';
import { Subscription } from '../subscription/entity/subscription.entity';
import { RestockSubscription } from '../restock/entity/restock-subscription.entity';
import { Campaign } from '../campaign/entity/campaign.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { AuditService } from '../audit/audit.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { maskPii } from '../../global/util/pii.util';

const REDACTED = '[redacted]';
const EXTERNAL_CHANNELS = ['email', 'sms', 'web_push'];
const PREF_CATEGORIES = ['payment', 'shipping', 'event', 'review'];

/**
 * Privacy / consumer-rights logic (audit High-2 GDPR webhooks, High-3 DSAR/CCPA).
 * Anonymization is best-effort: PII is scrubbed while keeping referential rows
 * (orders, inquiries) for operational integrity, unlinked from the customer.
 */
@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);

  constructor(
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(OrderCache) private readonly orderRepo: Repository<OrderCache>,
    @InjectRepository(OrderItem) private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(Fulfillment) private readonly fulfillmentRepo: Repository<Fulfillment>,
    @InjectRepository(Conversation) private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Message) private readonly messageRepo: Repository<Message>,
    @InjectRepository(Notification) private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationPref) private readonly prefRepo: Repository<NotificationPref>,
    @InjectRepository(Review) private readonly reviewRepo: Repository<Review>,
    @InjectRepository(Inquiry) private readonly inquiryRepo: Repository<Inquiry>,
    @InjectRepository(CjmEvent) private readonly cjmRepo: Repository<CjmEvent>,
    @InjectRepository(Affiliate) private readonly affiliateRepo: Repository<Affiliate>,
    @InjectRepository(Subscription) private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(RestockSubscription)
    private readonly restockRepo: Repository<RestockSubscription>,
    @InjectRepository(Campaign) private readonly campaignRepo: Repository<Campaign>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly audit: AuditService,
  ) {}

  // ---- session resolution (widget DSAR/CCPA) ----

  /** Resolve the bound customer from a session token; consumer-rights require auth. */
  async requireCustomerId(sessionToken: string): Promise<number> {
    const session = await this.sessionRepo.findOne({ where: { sessionToken } });
    if (!session) throw new BusinessException(ERROR_CODE.SESSION_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (session.customerId == null) {
      throw new BusinessException(ERROR_CODE.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
    }
    return session.customerId;
  }

  /**
   * Resolve the bound customer but demand Shopify-verified identity (SEC-C3).
   * Guest order-number+email lookup binds a session too, but those data points
   * (both printed on packing slips) must not unlock a full-account export or an
   * irreversible erasure — only the Shopify App Proxy path is strong enough.
   */
  async requireVerifiedCustomerId(sessionToken: string): Promise<number> {
    const session = await this.sessionRepo.findOne({ where: { sessionToken } });
    if (!session) throw new BusinessException(ERROR_CODE.SESSION_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (session.customerId == null || session.identityLevel !== SESSION_IDENTITY.VERIFIED) {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return session.customerId;
  }

  // ---- Shopify GDPR webhooks ----

  /** GDPR "request customer data" — logged; data is compiled out-of-band. */
  async handleCustomerDataRequest(email: string | null): Promise<void> {
    await this.audit.write({
      tenantId: null,
      actorType: 'admin',
      actorId: 0,
      action: 'gdpr.data_request',
      target: email ?? undefined,
    });
  }

  /** GDPR "redact customer" — anonymize the matching customer. */
  async handleCustomerRedact(email: string | null, shopifyCustomerId: string | null): Promise<void> {
    const customer = await this.findCustomer(email, shopifyCustomerId);
    if (customer) {
      await this.anonymizeCustomer(customer);
    }
    await this.audit.write({
      tenantId: customer?.tenantId ?? null,
      actorType: 'admin',
      actorId: 0,
      action: 'gdpr.customers_redact',
      target: email ?? shopifyCustomerId ?? undefined,
    });
  }

  /**
   * GDPR "redact shop" — full tenant purge. Resolve the tenant from shop_domain,
   * anonymize its customers, and delete all tenant-scoped rows by tenant_id.
   * Returns { purged: false } (without 500) when the shop does not resolve.
   */
  async handleShopRedact(shopDomain: string | null): Promise<{ purged: boolean; tenantId?: number }> {
    const tenant = shopDomain
      ? await this.tenantRepo.findOne({ where: { shopDomain } })
      : null;

    if (!tenant) {
      await this.audit.write({
        tenantId: null,
        actorType: 'admin',
        actorId: 0,
        action: 'gdpr.shop_redact',
        target: shopDomain ?? undefined,
      });
      return { purged: false };
    }

    const tenantId = tenant.id;
    await this.purgeTenant(tenantId);

    await this.audit.write({
      tenantId,
      actorType: 'admin',
      actorId: 0,
      action: 'gdpr.shop_redact',
      target: shopDomain ?? String(tenantId),
    });

    return { purged: true, tenantId };
  }

  /**
   * Anonymize the tenant's customers and delete all tenant-scoped rows. Wrapped in
   * a transaction so a partial failure rolls back. Order items/fulfillments are
   * deleted by tenant_id (they also carry tenant_id), alongside the order cache.
   */
  private async purgeTenant(tenantId: number): Promise<void> {
    await this.customerRepo.manager.transaction(async (mgr) => {
      // Anonymize customers (keep rows; scrub PII).
      await mgr.getRepository(Customer).update(
        { tenantId },
        { email: null, name: REDACTED, shopifyCustomerId: null, tier: 'guest' },
      );

      // Delete tenant-scoped rows. Children before parents where applicable.
      await mgr.getRepository(Message).delete({ tenantId });
      await mgr.getRepository(Conversation).delete({ tenantId });
      await mgr.getRepository(Notification).delete({ tenantId });
      await mgr.getRepository(NotificationPref).delete({ tenantId });
      await mgr.getRepository(Review).delete({ tenantId });
      await mgr.getRepository(Affiliate).delete({ tenantId });
      await mgr.getRepository(Subscription).delete({ tenantId });
      await mgr.getRepository(RestockSubscription).delete({ tenantId });
      await mgr.getRepository(Inquiry).delete({ tenantId });
      await mgr.getRepository(CjmEvent).delete({ tenantId });
      await mgr.getRepository(Campaign).delete({ tenantId });
      await mgr.getRepository(Fulfillment).delete({ tenantId });
      await mgr.getRepository(OrderItem).delete({ tenantId });
      await mgr.getRepository(OrderCache).delete({ tenantId });
      await mgr.getRepository(Session).delete({ tenantId });
    });
  }

  // ---- DSAR access / portability ----

  /** Assemble a machine-readable export of the customer's own data (DSAR access). */
  async exportData(sessionToken: string) {
    const customerId = await this.requireVerifiedCustomerId(sessionToken);
    const customer = await this.customerRepo.findOne({ where: { id: customerId } });

    const orders = await this.orderRepo.find({ where: { customerId } });
    const notifications = await this.notificationRepo.find({ where: { customerId } });
    const reviews = await this.reviewRepo.find({ where: { customerId } });
    const inquiries = await this.inquiryRepo.find({ where: { customerId } });

    // PII-access audit (best-effort; never fail the export on audit error).
    try {
      await this.audit.write({
        tenantId: customer?.tenantId ?? null,
        actorType: 'user',
        actorId: 0,
        action: 'dsar.export',
        target: maskPii(customer?.email ?? null),
      });
    } catch (err) {
      this.logger.warn(`dsar.export audit write failed: ${String(err)}`);
    }

    return {
      exportedAt: new Date().toISOString(),
      customer: customer
        ? {
            id: customer.id,
            email: customer.email,
            name: customer.name,
            tier: customer.tier,
            shopifyCustomerId: customer.shopifyCustomerId,
            createdAt: customer.createdAt,
          }
        : null,
      orders: orders.map((o) => ({
        orderNumber: o.orderNumber,
        status: o.statusUi ?? o.statusInternal,
        total: o.total,
        currency: o.currency,
      })),
      notifications: notifications.map((n) => ({
        category: n.category,
        title: n.title,
        body: n.body,
        channel: n.channel,
        createdAt: n.createdAt,
      })),
      reviews: reviews.map((r) => ({
        orderItemId: r.orderItemId,
        rating: r.rating,
        body: r.body,
        status: r.status,
        createdAt: r.createdAt,
      })),
      inquiries: inquiries.map((i) => ({
        id: i.id,
        orderId: i.orderId,
        status: i.status,
        createdAt: i.createdAt,
      })),
    };
  }

  // ---- DSAR erasure ----

  /** Anonymize the session's own customer (DSAR right to erasure). */
  async deleteData(sessionToken: string, confirm: boolean): Promise<void> {
    if (!confirm) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
    const customerId = await this.requireVerifiedCustomerId(sessionToken);
    const customer = await this.customerRepo.findOne({ where: { id: customerId } });
    if (customer) await this.anonymizeCustomer(customer);
    await this.audit.write({
      tenantId: customer?.tenantId ?? null,
      actorType: 'admin',
      actorId: 0,
      action: 'dsar.delete',
      target: String(customerId),
    });
  }

  // ---- CCPA / CPRA "Do Not Sell or Share" ----

  /** Toggle external-channel opt-out across all categories (in_app stays on). */
  async setOptOut(sessionToken: string, optOut: boolean): Promise<void> {
    const customerId = await this.requireCustomerId(sessionToken);
    const enabled = optOut ? 0 : 1;

    for (const channel of EXTERNAL_CHANNELS) {
      for (const category of PREF_CATEGORIES) {
        let pref = await this.prefRepo.findOne({ where: { customerId, channel, category } });
        if (pref) {
          pref.enabled = enabled;
        } else {
          pref = this.prefRepo.create({ customerId, channel, category, enabled });
        }
        await this.prefRepo.save(pref);
      }
    }

    await this.audit.write({
      tenantId: null,
      actorType: 'admin',
      actorId: 0,
      action: 'ccpa.opt_out',
      target: String(optOut),
    });
  }

  /** Opt-out is true when every external channel is disabled. */
  async getOptOutStatus(sessionToken: string): Promise<boolean> {
    const customerId = await this.requireCustomerId(sessionToken);
    const prefs = await this.prefRepo.find({
      where: { customerId, channel: In(EXTERNAL_CHANNELS) },
    });
    if (prefs.length === 0) return false;
    return prefs.every((p) => p.enabled === 0);
  }

  // ---- shared anonymization (best-effort PII scrub) ----

  private async findCustomer(
    email: string | null,
    shopifyCustomerId: string | null,
  ): Promise<Customer | null> {
    if (email) {
      const byEmail = await this.customerRepo.findOne({ where: { email } });
      if (byEmail) return byEmail;
    }
    if (shopifyCustomerId) {
      return this.customerRepo.findOne({ where: { shopifyCustomerId } });
    }
    return null;
  }

  /**
   * Scrub a single customer's PII while preserving referential rows. Messages are
   * reached via sessions -> conversations (best-effort); orders/inquiries are kept
   * but unlinked; reviews/notifications are redacted in place.
   */
  private async anonymizeCustomer(customer: Customer): Promise<void> {
    const customerId = customer.id;

    // Redact chat messages reachable from the customer's sessions.
    const sessions = await this.sessionRepo.find({ where: { customerId } });
    const sessionIds = sessions.map((s) => s.id);
    if (sessionIds.length) {
      const conversations = await this.conversationRepo.find({
        where: { sessionId: In(sessionIds) },
      });
      const conversationIds = conversations.map((c) => c.id);
      if (conversationIds.length) {
        await this.messageRepo.update(
          { conversationId: In(conversationIds) },
          { body: REDACTED },
        );
      }
    }

    // Notifications: redact title/body.
    await this.notificationRepo.update({ customerId }, { title: REDACTED, body: REDACTED });

    // Reviews: null out free-text body.
    await this.reviewRepo.update({ customerId }, { body: null });

    // Inquiries: keep the row but unlink from the customer.
    await this.inquiryRepo.update({ customerId }, { customerId: null });

    // CJM events: unlink from the customer.
    await this.cjmRepo.update({ customerId }, { customerId: null });

    // Orders: keep operational record but unlink PII association.
    await this.orderRepo.update({ customerId }, { customerId: null });

    // Sessions: unbind the customer.
    if (sessionIds.length) {
      await this.sessionRepo.update({ customerId }, { customerId: null });
    }

    // Finally, anonymize the customer record itself.
    customer.email = null;
    customer.name = REDACTED;
    customer.shopifyCustomerId = null;
    customer.tier = 'guest';
    await this.customerRepo.save(customer);
  }
}
