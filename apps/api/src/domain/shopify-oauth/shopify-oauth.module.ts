import { Module } from '@nestjs/common';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyOAuthController } from './shopify-oauth.controller';
import { TenantModule } from '../tenant/tenant.module';

/** Shopify public-app OAuth (path B). RedisService comes from the global infra module. */
@Module({
  imports: [TenantModule],
  controllers: [ShopifyOAuthController],
  providers: [ShopifyOAuthService],
})
export class ShopifyOAuthModule {}
