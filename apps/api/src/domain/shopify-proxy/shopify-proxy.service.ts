import { Injectable, Logger } from '@nestjs/common';
import { SessionService } from '../session/session.service';
import { CustomerService } from '../customer/customer.service';
import { TenantService } from '../tenant/tenant.service';
import { ShopifyAdminClient } from '../order/shopify-admin.client';
import { ShopifySyncService } from '../order/shopify-sync.service';
import { verifyShopifyProxySignature } from '../../global/util/shopify-hmac.util';

export interface ProxyIdentityResult {
  authenticated: boolean;
  sessionToken?: string;
}

/** Reason an identity request did not authenticate — drives the HTTP status. */
export type IdentityOutcome =
  | { status: 'ok'; result: ProxyIdentityResult }
  | { status: 'bad_signature' };

/**
 * Shopify App Proxy identity bridge. The storefront (same origin as the shop)
 * fetches `/apps/<subpath>/identity`; Shopify proxies it here with a signed
 * `logged_in_customer_id`. We verify the signature, resolve the tenant by shop,
 * and mint a customer-bound session token the widget iframe adopts — turning the
 * cross-origin widget authenticated without trusting any client-supplied identity.
 */
@Injectable()
export class ShopifyProxyService {
  private readonly logger = new Logger(ShopifyProxyService.name);

  constructor(
    private readonly sessionService: SessionService,
    private readonly customerService: CustomerService,
    private readonly tenantService: TenantService,
    private readonly adminClient: ShopifyAdminClient,
    private readonly syncService: ShopifySyncService,
  ) {}

  async resolveIdentity(query: Record<string, unknown>): Promise<IdentityOutcome> {
    const secret = process.env.SHOPIFY_API_SECRET;
    if (!secret) {
      // Feature not configured — fail safe as anonymous, never authenticate.
      this.logger.warn('SHOPIFY_API_SECRET not set — app-proxy identity disabled');
      return { status: 'ok', result: { authenticated: false } };
    }

    if (!verifyShopifyProxySignature(query, secret)) {
      return { status: 'bad_signature' };
    }

    const shop = typeof query.shop === 'string' ? query.shop : '';
    const customerIdRaw = query.logged_in_customer_id;
    const shopifyCustomerId =
      customerIdRaw != null && String(customerIdRaw).trim() !== ''
        ? String(customerIdRaw).trim()
        : '';
    if (!shop || !shopifyCustomerId) {
      // Signed request, but no logged-in customer — legitimate anonymous visitor.
      return { status: 'ok', result: { authenticated: false } };
    }

    const tenant = await this.sessionService.findTenantByShop(shop);
    if (!tenant) {
      this.logger.warn(`App-proxy identity for unknown shop: ${shop}`);
      return { status: 'ok', result: { authenticated: false } };
    }

    const customer = await this.customerService.findOrCreateByShopifyId(
      tenant.id,
      shopifyCustomerId,
    );
    // This shopper asked to be erased. They are still signed into the storefront —
    // Shopify knows them, we deliberately no longer do — so report them as anonymous
    // rather than rebuilding the profile they deleted. The widget then behaves as it
    // does for any visitor: chat works, "my orders" offers sign-in it cannot satisfy.
    if (!customer) {
      return { status: 'ok', result: { authenticated: false } };
    }
    // Enrich the row with the customer's real name/email from the Admin API when
    // we don't have them yet (the proxy only hands us the numeric id). Fire-and-
    // forget: nothing in this response needs it, and it must not add Admin API
    // latency to the widget handshake — it feeds the agent console + later lookups.
    if (!customer.email || !customer.name) {
      void this.backfillProfile(tenant.id, shopifyCustomerId);
    }
    // Pull this customer's order history into the cache so "my orders" is
    // populated on first sign-in (webhooks only cover orders placed after the
    // store connected). Fire-and-forget like the profile backfill: the widget
    // handshake must not wait on the Admin API, and the sync service suppresses
    // repeat runs per customer (identity resolves on every page load).
    void this.backfillOrders(tenant.id, shopifyCustomerId);
    const locale = typeof query.locale === 'string' ? query.locale : undefined;
    // Resume the shopper's recent session rather than minting one per page load —
    // conversations hang off the session, so a new one would empty the chat every
    // time they follow a link.
    const session = await this.sessionService.findOrCreateForCustomer(
      tenant.id,
      customer.id,
      locale,
    );
    return { status: 'ok', result: { authenticated: true, sessionToken: session.sessionToken } };
  }

  /**
   * Best-effort: read the customer's contact profile from the Admin API and fill
   * name/email onto the (id-keyed) row. Never throws — until Protected Customer
   * Data is approved this 403s, and order sync backfills the email later anyway.
   * Runs unawaited on the request path, so it self-heals on the next visit once
   * the profile becomes readable.
   */
  /** Best-effort login-time order backfill — never throws (runs unawaited). */
  private async backfillOrders(tenantId: number, shopifyCustomerId: string): Promise<void> {
    try {
      await this.syncService.syncOrdersForCustomer(tenantId, shopifyCustomerId);
    } catch (err) {
      this.logger.debug(
        `order backfill skipped for ${shopifyCustomerId}: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
    }
  }

  private async backfillProfile(tenantId: number, shopifyCustomerId: string): Promise<void> {
    try {
      const conn = await this.tenantService.getShopifyConnection(tenantId);
      if (!conn) return;
      const profile = await this.adminClient.fetchCustomer(
        conn.shopDomain,
        conn.token,
        shopifyCustomerId,
      );
      if (!profile) return;
      const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || null;
      await this.customerService.backfillProfileByShopifyId(tenantId, shopifyCustomerId, {
        email: profile.email,
        name,
      });
    } catch (err) {
      this.logger.debug(
        `customer profile backfill skipped for ${shopifyCustomerId}: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
    }
  }
}
