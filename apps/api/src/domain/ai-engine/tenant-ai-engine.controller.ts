import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal } from '@ivy/types';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { TenantAiEngineService, TENANT_PROVIDERS } from './tenant-ai-engine.service';
import { AiEngineMapper } from './ai-engine.mapper';
import {
  SaveTenantEngineRequest,
  UpdateTenantEngineRequest,
} from './dto/request/ai-engine.request';

/**
 * A tenant's own AI engines (PLN-260824). TENANT_AI_ENGINE_MANAGE — master only,
 * because this screen takes an API key and decides who is billed for the calls.
 */
@ApiTags('Tenant AI Engines')
@Controller('tenants/me/ai-engines')
export class TenantAiEngineController {
  constructor(private readonly service: TenantAiEngineService) {}

  private tenantId(user: Principal): number {
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return user.tenantId;
  }

  @Get()
  @RequireCapability(CAPABILITY.TENANT_AI_ENGINE_MANAGE)
  @ApiOperation({ summary: "The tenant's own engines plus the read-only platform ones" })
  async list(@CurrentUser() user: Principal) {
    const tenantId = this.tenantId(user);
    const [own, platform] = await Promise.all([
      this.service.listOwn(tenantId),
      this.service.listPlatform(),
    ]);
    return {
      providers: TENANT_PROVIDERS,
      own: AiEngineMapper.toTenantEngineList(own),
      // Shown so the operator can see what they fall back to, and that their
      // own engine wins over it. Never editable from here.
      platform: AiEngineMapper.toTenantEngineList(platform),
    };
  }

  @Post()
  @RequireCapability(CAPABILITY.TENANT_AI_ENGINE_MANAGE)
  @ApiOperation({ summary: 'Register an engine for this tenant' })
  async create(@CurrentUser() user: Principal, @Body() body: SaveTenantEngineRequest) {
    const engine = await this.service.create(this.tenantId(user), {
      name: body.name,
      provider: body.provider,
      model: body.model,
      endpoint: body.endpoint ?? null,
      apiKey: body.api_key ?? null,
    });
    return AiEngineMapper.toTenantEngine(engine);
  }

  @Patch(':id')
  @RequireCapability(CAPABILITY.TENANT_AI_ENGINE_MANAGE)
  @ApiOperation({ summary: 'Edit one of this tenant\'s engines' })
  async update(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateTenantEngineRequest,
  ) {
    const engine = await this.service.update(this.tenantId(user), id, {
      name: body.name,
      provider: body.provider,
      model: body.model,
      endpoint: body.endpoint,
      apiKey: body.api_key,
    });
    return AiEngineMapper.toTenantEngine(engine);
  }

  @Put(':id/default')
  @RequireCapability(CAPABILITY.TENANT_AI_ENGINE_MANAGE)
  @ApiOperation({ summary: "Make this the tenant's default engine" })
  async setDefault(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const engine = await this.service.setDefault(this.tenantId(user), id);
    return AiEngineMapper.toTenantEngine(engine);
  }

  @Post(':id/test')
  @RequireCapability(CAPABILITY.TENANT_AI_ENGINE_MANAGE)
  @ApiOperation({ summary: 'Call the provider once to check the key and the model name' })
  async test(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    return this.service.test(this.tenantId(user), id);
  }

  @Delete(':id')
  @RequireCapability(CAPABILITY.TENANT_AI_ENGINE_MANAGE)
  @ApiOperation({ summary: 'Delete an engine no function is assigned to' })
  async remove(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const tenantId = this.tenantId(user);
    // Named before refusing: "in use" without saying by what leaves the
    // operator hunting through six functions.
    const usedBy = await this.service.usedBy(tenantId, id);
    if (usedBy.length) {
      return { removed: false, usedBy };
    }
    await this.service.remove(tenantId, id);
    return { removed: true, usedBy: [] };
  }
}
