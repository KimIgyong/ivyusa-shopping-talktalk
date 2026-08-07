import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductCache } from './entity/product-cache.entity';
import { ProductSave } from '../save/entity/product-save.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { ProductService } from './product.service';
import { ProductSyncService } from './product-sync.service';
import { ProductAdminController, ProductController } from './product.controller';
import { SessionModule } from '../session/session.module';

@Module({
  // Tenant is registered for the repository only (storefront origin lookup) —
  // no TenantModule import needed for that. ProductSave likewise: repository-only,
  // the recommendation signal (A-10) reads the customer's saves by handle.
  imports: [TypeOrmModule.forFeature([ProductCache, ProductSave, Tenant]), SessionModule],
  controllers: [ProductController, ProductAdminController],
  providers: [ProductService, ProductSyncService],
  exports: [ProductService, ProductSyncService],
})
export class ProductModule {}
