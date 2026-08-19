import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entity/tenant.entity';
import { IntegrationCredential } from './entity/integration-credential.entity';
import { User } from '../user/entity/user.entity';
import { ContentFilterRule } from '../moderation/entity/content-filter-rule.entity';
import { JobLabel } from '../user/entity/job-label.entity';
import { TenantService } from './tenant.service';
import { EcommerceIntegrationService } from './ecommerce-integration.service';
import { WebhookSecretService } from './webhook-secret.service';
import { WidgetLogoService } from './widget-logo.service';
import { TenantController } from './tenant.controller';
import { WidgetBrandingController } from './widget-branding.controller';
import { IntegrationModule } from '../integration/integration.module';
import { AuditModule } from '../audit/audit.module';
import { EmbedModule } from '../embed/embed.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, IntegrationCredential, User, ContentFilterRule, JobLabel]),
    IntegrationModule,
    AuditModule,
    // For the secret-rotation route; EmbedModule owns the secret's lifecycle.
    EmbedModule,
  ],
  controllers: [TenantController, WidgetBrandingController],
  providers: [TenantService, EcommerceIntegrationService, WebhookSecretService, WidgetLogoService],
  exports: [TenantService, WebhookSecretService, WidgetLogoService],
})
export class TenantModule {}
