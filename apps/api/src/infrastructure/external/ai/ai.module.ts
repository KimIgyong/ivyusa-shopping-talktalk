import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiEngine } from '../../../domain/ai-engine/entity/ai-engine.entity';
import { TenantAiSetting } from '../../../domain/ai-engine/entity/tenant-ai-setting.entity';
import { AiUsageDaily } from '../../../domain/ai-engine/entity/ai-usage-daily.entity';
import { AiUsageService } from '../../../domain/ai-engine/ai-usage.service';
import { AiGatewayService } from './ai-gateway.service';
import { StubAdapter } from './adapters/stub.adapter';
import { AnthropicAdapter } from './adapters/anthropic.adapter';
import { OpenAiAdapter } from './adapters/openai.adapter';
import { VoyageAdapter } from './adapters/voyage.adapter';

/** Global AI gateway available to RAG, summary, assist, moderation, and embedding. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AiEngine, TenantAiSetting, AiUsageDaily])],
  providers: [AiGatewayService, AiUsageService, StubAdapter, AnthropicAdapter, OpenAiAdapter, VoyageAdapter],
  exports: [AiGatewayService, AiUsageService],
})
export class AiModule {}
