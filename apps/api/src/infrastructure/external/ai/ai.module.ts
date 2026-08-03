import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiEngine } from '../../../domain/ai-engine/entity/ai-engine.entity';
import { TenantAiSetting } from '../../../domain/ai-engine/entity/tenant-ai-setting.entity';
import { AiGatewayService } from './ai-gateway.service';
import { StubAdapter } from './adapters/stub.adapter';
import { AnthropicAdapter } from './adapters/anthropic.adapter';
import { VoyageAdapter } from './adapters/voyage.adapter';

/** Global AI gateway available to RAG, summary, assist, moderation, and embedding. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AiEngine, TenantAiSetting])],
  providers: [AiGatewayService, StubAdapter, AnthropicAdapter, VoyageAdapter],
  exports: [AiGatewayService],
})
export class AiModule {}
