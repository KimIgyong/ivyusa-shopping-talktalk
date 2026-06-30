import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiEngine } from './entity/ai-engine.entity';
import { TenantAiSetting } from './entity/tenant-ai-setting.entity';
import { TenantAiConfig } from './entity/tenant-ai-config.entity';
import { Session } from '../session/entity/session.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { AiEngineService } from './ai-engine.service';
import { AiSettingService } from './ai-setting.service';
import { AiConfigService } from './ai-config.service';
import { AiEngineController } from './ai-engine.controller';
import { AiSettingController } from './ai-setting.controller';
import { AiConfigController } from './ai-config.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AiEngine, TenantAiSetting, TenantAiConfig, Session, Tenant])],
  controllers: [AiEngineController, AiSettingController, AiConfigController],
  providers: [AiEngineService, AiSettingService, AiConfigService],
  exports: [AiEngineService, AiSettingService, AiConfigService],
})
export class AiEngineModule {}
