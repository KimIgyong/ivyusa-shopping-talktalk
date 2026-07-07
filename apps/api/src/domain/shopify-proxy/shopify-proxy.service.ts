import { Injectable, Logger } from '@nestjs/common';
import { SessionService } from '../session/session.service';
import { CustomerService } from '../customer/customer.service';
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
    const locale = typeof query.locale === 'string' ? query.locale : undefined;
    const session = await this.sessionService.createForCustomer(
      tenant.id,
      customer.id,
      locale,
    );
    return { status: 'ok', result: { authenticated: true, sessionToken: session.sessionToken } };
  }
}
