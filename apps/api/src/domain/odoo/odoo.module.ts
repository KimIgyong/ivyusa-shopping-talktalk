import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductCache } from '../product/entity/product-cache.entity';
import { OrderCache } from '../order/entity/order-cache.entity';
import { OrderItem } from '../order/entity/order-item.entity';
import { IntegrationCredential } from '../tenant/entity/integration-credential.entity';
import { IntegrationModule } from '../integration/integration.module';
import { TenantModule } from '../tenant/tenant.module';
import { CustomerModule } from '../customer/customer.module';
import { OdooClient } from './odoo.client';
import { OdooProductSyncService } from './odoo-product-sync.service';
import { OdooSyncService } from './odoo-sync.service';
import { ScheduledOdooSyncService } from './scheduled-odoo-sync.service';
import { OdooController } from './odoo.controller';

/** Odoo integration — products-only for now (REQ-260826, W1/W2/W5). */
@Module({
  imports: [
    TypeOrmModule.forFeature([ProductCache, OrderCache, OrderItem, IntegrationCredential]),
    IntegrationModule,
    TenantModule,
    CustomerModule,
  ],
  controllers: [OdooController],
  providers: [OdooClient, OdooProductSyncService, OdooSyncService, ScheduledOdooSyncService],
  exports: [OdooClient, OdooProductSyncService, OdooSyncService],
})
export class OdooModule {}
