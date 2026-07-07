import { Module } from '@nestjs/common';
import { ShopifyProxyController } from './shopify-proxy.controller';
import { ShopifyProxyService } from './shopify-proxy.service';
import { SessionModule } from '../session/session.module';
import { CustomerModule } from '../customer/customer.module';

/** Shopify App Proxy identity bridge (storefront logged-in customer → session). */
@Module({
  imports: [SessionModule, CustomerModule],
  controllers: [ShopifyProxyController],
  providers: [ShopifyProxyService],
})
export class ShopifyProxyModule {}
