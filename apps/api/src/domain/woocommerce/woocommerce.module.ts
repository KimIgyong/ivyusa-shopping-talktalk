import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductCache } from '../product/entity/product-cache.entity';
import { OrderCache } from '../order/entity/order-cache.entity';
import { OrderItem } from '../order/entity/order-item.entity';
import { IntegrationCredential } from '../tenant/entity/integration-credential.entity';
import { IntegrationModule } from '../integration/integration.module';
import { TenantModule } from '../tenant/tenant.module';
import { CustomerModule } from '../customer/customer.module';
import { WooClient } from './woocommerce.client';
import { WooProductSyncService } from './woocommerce-product-sync.service';
import { WooSyncService } from './woocommerce-sync.service';
import { ScheduledWooSyncService } from './scheduled-woocommerce-sync.service';
import { WooController } from './woocommerce.controller';

/** WooCommerce integration — products + orders/customers (REQ-260826). */
@Module({
  imports: [
    TypeOrmModule.forFeature([ProductCache, OrderCache, OrderItem, IntegrationCredential]),
    IntegrationModule,
    TenantModule,
    CustomerModule,
  ],
  controllers: [WooController],
  providers: [WooClient, WooProductSyncService, WooSyncService, ScheduledWooSyncService],
  exports: [WooClient, WooProductSyncService, WooSyncService],
})
export class WooModule {}
