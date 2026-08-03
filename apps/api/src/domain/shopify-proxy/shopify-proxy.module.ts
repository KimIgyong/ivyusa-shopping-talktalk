import { Module } from '@nestjs/common';
import { ShopifyProxyController } from './shopify-proxy.controller';
import { ShopifyProxyService } from './shopify-proxy.service';
import { SessionModule } from '../session/session.module';
import { CustomerModule } from '../customer/customer.module';
import { TenantModule } from '../tenant/tenant.module';
import { OrderModule } from '../order/order.module';
import { ShopifyAdminClient } from '../order/shopify-admin.client';

/** Shopify App Proxy identity bridge (storefront logged-in customer → session). */
@Module({
  // OrderModule supplies ShopifySyncService for the login-time order backfill.
  imports: [SessionModule, CustomerModule, TenantModule, OrderModule],
  controllers: [ShopifyProxyController],
  // ShopifyAdminClient is a stateless (dependency-free) fetch wrapper, provided
  // directly for the customer-profile backfill.
  providers: [ShopifyProxyService, ShopifyAdminClient],
})
export class ShopifyProxyModule {}
