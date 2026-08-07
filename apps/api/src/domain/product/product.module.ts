import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductCache } from './entity/product-cache.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { ProductService } from './product.service';
import { ProductSyncService } from './product-sync.service';
import { ProductAdminController, ProductController } from './product.controller';
import { SessionModule } from '../session/session.module';

@Module({
  // Tenant is registered for the repository only (storefront origin lookup) —
  // no TenantModule import needed for that.
  imports: [TypeOrmModule.forFeature([ProductCache, Tenant]), SessionModule],
  controllers: [ProductController, ProductAdminController],
  providers: [ProductService, ProductSyncService],
  exports: [ProductService, ProductSyncService],
})
export class ProductModule {}
