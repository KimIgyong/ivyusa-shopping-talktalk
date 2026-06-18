import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiEngine } from './entity/ai-engine.entity';
import { TenantAiSetting } from './entity/tenant-ai-setting.entity';
import { AiEngineService } from './ai-engine.service';
import { AiSettingService } from './ai-setting.service';
import { AiEngineController } from './ai-engine.controller';
import { AiSettingController } from './ai-setting.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AiEngine, TenantAiSetting])],
  controllers: [AiEngineController, AiSettingController],
  providers: [AiEngineService, AiSettingService],
  exports: [AiEngineService, AiSettingService],
})
export class AiEngineModule {}
