import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entity/tenant.entity';
import { IntegrationCredential } from './entity/integration-credential.entity';
import { TenantService } from './tenant.service';
import { EcommerceIntegrationService } from './ecommerce-integration.service';
import { WebhookSecretService } from './webhook-secret.service';
import { TenantController } from './tenant.controller';
import { IntegrationModule } from '../integration/integration.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, IntegrationCredential]), IntegrationModule, AuditModule],
  controllers: [TenantController],
  providers: [TenantService, EcommerceIntegrationService, WebhookSecretService],
  exports: [TenantService, WebhookSecretService],
})
export class TenantModule {}
