import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductCache } from '../product/entity/product-cache.entity';
import { OrderCache } from '../order/entity/order-cache.entity';
import { OrderItem } from '../order/entity/order-item.entity';
import { IntegrationCredential } from '../tenant/entity/integration-credential.entity';
import { IntegrationModule } from '../integration/integration.module';
import { TenantModule } from '../tenant/tenant.module';
import { CustomerModule } from '../customer/customer.module';
import { HaravanClient } from './haravan.client';
import { HaravanProductSyncService } from './haravan-product-sync.service';
import { HaravanSyncService } from './haravan-sync.service';
import { ScheduledHaravanSyncService } from './scheduled-haravan-sync.service';
import { HaravanController } from './haravan.controller';

/** Haravan integration — products + orders/customers (REQ-260826). */
@Module({
  imports: [
    TypeOrmModule.forFeature([ProductCache, OrderCache, OrderItem, IntegrationCredential]),
    IntegrationModule,
    TenantModule,
    CustomerModule,
  ],
  controllers: [HaravanController],
  providers: [HaravanClient, HaravanProductSyncService, HaravanSyncService, ScheduledHaravanSyncService],
  exports: [HaravanClient, HaravanProductSyncService, HaravanSyncService],
})
export class HaravanModule {}
