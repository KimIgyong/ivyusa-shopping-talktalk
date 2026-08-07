import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderCache } from '../order/entity/order-cache.entity';
import { IntegrationCredential } from '../tenant/entity/integration-credential.entity';
import { TenantModule } from '../tenant/tenant.module';
import { CustomerModule } from '../customer/customer.module';
import { Cafe24AdminClient } from './cafe24-admin.client';
import { Cafe24TokenService } from './cafe24-token.service';
import { Cafe24OAuthService } from './cafe24-oauth.service';
import { Cafe24SyncService } from './cafe24-sync.service';
import { ScheduledCafe24SyncService } from './scheduled-cafe24-sync.service';
import { Cafe24OAuthController } from './cafe24-oauth.controller';
import { Cafe24Controller } from './cafe24.controller';

/**
 * Cafe24 commerce integration (Mode A, PLN-260807 P-A1): OAuth + read-only order
 * sync into orders_cache. RedisService comes from the global infra module.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([OrderCache, IntegrationCredential]),
    TenantModule,
    CustomerModule,
  ],
  controllers: [Cafe24OAuthController, Cafe24Controller],
  providers: [
    Cafe24AdminClient,
    Cafe24TokenService,
    Cafe24OAuthService,
    Cafe24SyncService,
    ScheduledCafe24SyncService,
  ],
  exports: [Cafe24TokenService, Cafe24AdminClient],
})
export class Cafe24Module {}
