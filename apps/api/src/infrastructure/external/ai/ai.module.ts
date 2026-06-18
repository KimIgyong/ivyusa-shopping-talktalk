import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiEngine } from '../../../domain/ai-engine/entity/ai-engine.entity';
import { TenantAiSetting } from '../../../domain/ai-engine/entity/tenant-ai-setting.entity';
import { AiGatewayService } from './ai-gateway.service';
import { StubAdapter } from './adapters/stub.adapter';
import { AnthropicAdapter } from './adapters/anthropic.adapter';

/** Global AI gateway available to RAG, summary, assist, and moderation. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AiEngine, TenantAiSetting])],
  providers: [AiGatewayService, StubAdapter, AnthropicAdapter],
  exports: [AiGatewayService],
})
export class AiModule {}
