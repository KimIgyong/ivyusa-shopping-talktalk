import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entity/tenant.entity';
import { IntegrationCredential } from './entity/integration-credential.entity';
import { TenantService } from './tenant.service';
import { EcommerceIntegrationService } from './ecommerce-integration.service';
import { TenantController } from './tenant.controller';
import { IntegrationModule } from '../integration/integration.module';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, IntegrationCredential]), IntegrationModule],
  controllers: [TenantController],
  providers: [TenantService, EcommerceIntegrationService],
  exports: [TenantService],
})
export class TenantModule {}
