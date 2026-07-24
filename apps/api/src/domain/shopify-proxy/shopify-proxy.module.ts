import { Module } from '@nestjs/common';
import { ShopifyProxyController } from './shopify-proxy.controller';
import { ShopifyProxyService } from './shopify-proxy.service';
import { SessionModule } from '../session/session.module';
import { CustomerModule } from '../customer/customer.module';
import { TenantModule } from '../tenant/tenant.module';
import { ShopifyAdminClient } from '../order/shopify-admin.client';

/** Shopify App Proxy identity bridge (storefront logged-in customer → session). */
@Module({
  imports: [SessionModule, CustomerModule, TenantModule],
  controllers: [ShopifyProxyController],
  // ShopifyAdminClient is a stateless (dependency-free) fetch wrapper, so we
  // provide it directly here to backfill the customer profile without pulling in
  // the whole OrderModule graph.
  providers: [ShopifyProxyService, ShopifyAdminClient],
})
export class ShopifyProxyModule {}
