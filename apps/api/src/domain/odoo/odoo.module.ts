import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductCache } from '../product/entity/product-cache.entity';
import { IntegrationCredential } from '../tenant/entity/integration-credential.entity';
import { IntegrationModule } from '../integration/integration.module';
import { OdooClient } from './odoo.client';
import { OdooProductSyncService } from './odoo-product-sync.service';
import { OdooController } from './odoo.controller';

/** Odoo integration — products-only for now (REQ-260826, W1/W2/W5). */
@Module({
  imports: [TypeOrmModule.forFeature([ProductCache, IntegrationCredential]), IntegrationModule],
  controllers: [OdooController],
  providers: [OdooClient, OdooProductSyncService],
  exports: [OdooClient, OdooProductSyncService],
})
export class OdooModule {}
