import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal } from '@ivy/types';
import { AiConfigService } from './ai-config.service';
import { UpdateAiConfigRequest } from './dto/request/ai-config.request';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { Public } from '../../global/decorator/public.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { HttpStatus } from '@nestjs/common';

/** AI behavior config (FR-047 / FN-040): persona, response rules, scenario buttons. */
@ApiTags('AI Config')
@Controller('ai-config')
export class AiConfigController {
  constructor(private readonly aiConfig: AiConfigService) {}

  @Get()
  @RequireCapability(CAPABILITY.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Get tenant AI config (persona/rules/scenario buttons)' })
  get(@CurrentUser() user: Principal) {
    return this.aiConfig.getConfig(this.tenantId(user));
  }

  @Put()
  @RequireCapability(CAPABILITY.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Update tenant AI config' })
  update(@CurrentUser() user: Principal, @Body() body: UpdateAiConfigRequest) {
    return this.aiConfig.upsertConfig(this.tenantId(user), {
      persona: body.persona,
      rules: body.rules,
      scenarioButtons: body.scenario_buttons,
    });
  }

  @Get('scenario')
  @Public()
  @ApiOperation({ summary: 'Widget: enabled scenario buttons for the session tenant' })
  scenario(@Query('session_token') sessionToken: string) {
    return this.aiConfig.getScenarioForSession(sessionToken);
  }

  private tenantId(user: Principal): number {
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return user.tenantId;
  }
}
