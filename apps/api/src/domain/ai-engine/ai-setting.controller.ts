import { Body, Controller, Get, HttpStatus, Param, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal } from '@ivy/types';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { AiSettingService } from './ai-setting.service';
import { AiEngineService } from './ai-engine.service';
import { AiEngineMapper } from './ai-engine.mapper';
import { FunctionParam, UpsertAiSettingRequest } from './dto/request/ai-engine.request';

/** Tenant AI settings: per-function engine selection (FR-070). AI_SETTINGS_MANAGE. */
@ApiTags('AI Settings')
@Controller('ai-settings')
export class AiSettingController {
  constructor(
    private readonly aiSettingService: AiSettingService,
    private readonly aiEngineService: AiEngineService,
  ) {}

  /** Narrow to a tenant user; AI settings are tenant-scoped only. */
  private tenantId(user: Principal): number {
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return user.tenantId;
  }

  @Get()
  @RequireCapability(CAPABILITY.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Tenant function->engine settings plus available engines' })
  async list(@CurrentUser() user: Principal) {
    const [settings, engines] = await Promise.all([
      this.aiSettingService.list(this.tenantId(user)),
      this.aiEngineService.listEnabled(),
    ]);
    return {
      settings: settings.map(({ setting, engineName }) =>
        AiEngineMapper.toSetting(setting, engineName),
      ),
      availableEngines: AiEngineMapper.toEngineOptionList(engines),
    };
  }

  @Put(':function')
  @RequireCapability(CAPABILITY.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Assign an engine to an AI function (upsert)' })
  async upsert(
    @CurrentUser() user: Principal,
    @Param() params: FunctionParam,
    @Body() body: UpsertAiSettingRequest,
  ) {
    const setting = await this.aiSettingService.upsert(
      this.tenantId(user),
      params.function,
      body,
    );
    const engine = await this.aiEngineService.findEngine(setting.engineId);
    return AiEngineMapper.toSetting(setting, engine.name);
  }
}
