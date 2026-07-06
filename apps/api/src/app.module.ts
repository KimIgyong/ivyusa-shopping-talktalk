import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { buildTypeOrmOptions } from './global/config/typeorm.config';
import { GlobalModule } from './global/global.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { AiModule } from './infrastructure/external/ai/ai.module';
import { JwtAuthGuard } from './global/guard/jwt-auth.guard';

// Domain modules
import { AuthModule } from './domain/auth/auth.module';
import { SessionModule } from './domain/session/session.module';
import { ChatModule } from './domain/chat/chat.module';
import { ModerationModule } from './domain/moderation/moderation.module';
import { TenantModule } from './domain/tenant/tenant.module';
import { UserModule } from './domain/user/user.module';
import { OrderModule } from './domain/order/order.module';
import { NotificationModule } from './domain/notification/notification.module';
import { ReviewModule } from './domain/review/review.module';
import { AffiliateModule } from './domain/affiliate/affiliate.module';
import { RestockModule } from './domain/restock/restock.module';
import { SubscriptionModule } from './domain/subscription/subscription.module';
import { InquiryModule } from './domain/inquiry/inquiry.module';
import { KnowledgeModule } from './domain/knowledge/knowledge.module';
import { CampaignModule } from './domain/campaign/campaign.module';
import { CjmModule } from './domain/cjm/cjm.module';
import { IntegrationModule } from './domain/integration/integration.module';
import { AgentModule } from './domain/agent/agent.module';
import { AuditModule } from './domain/audit/audit.module';
import { AiEngineModule } from './domain/ai-engine/ai-engine.module';
import { AnalyticsModule } from './domain/analytics/analytics.module';
import { CustomerModule } from './domain/customer/customer.module';
import { PrivacyModule } from './domain/privacy/privacy.module';
import { HealthModule } from './domain/health/health.module';
import { ShopifyOAuthModule } from './domain/shopify-oauth/shopify-oauth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../env/backend/.env.development', '.env'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildTypeOrmOptions(config),
    }),
    GlobalModule,
    InfrastructureModule,
    AiModule,
    // domains
    AuthModule,
    SessionModule,
    ChatModule,
    ModerationModule,
    TenantModule,
    UserModule,
    CustomerModule,
    OrderModule,
    ShopifyOAuthModule,
    NotificationModule,
    ReviewModule,
    AffiliateModule,
    RestockModule,
    SubscriptionModule,
    InquiryModule,
    KnowledgeModule,
    CampaignModule,
    CjmModule,
    IntegrationModule,
    AgentModule,
    AuditModule,
    AiEngineModule,
    AnalyticsModule,
    PrivacyModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
