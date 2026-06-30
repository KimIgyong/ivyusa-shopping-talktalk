import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY } from '@ivy/types';
import { AdminOnly, RequireCapability } from '../../global/decorator/auth.decorator';
import { AiEngineService } from './ai-engine.service';
import { AiEngineMapper } from './ai-engine.mapper';
import { CreateEngineRequest, UpdateEngineRequest } from './dto/request/ai-engine.request';

/** Platform AI engine catalog (FR-070). Admin-only, AI_ENGINE_MANAGE. */
@ApiTags('AI Engines')
@Controller('ai-engines')
export class AiEngineController {
  constructor(private readonly aiEngineService: AiEngineService) {}

  @Get()
  @AdminOnly()
  @RequireCapability(CAPABILITY.AI_ENGINE_MANAGE)
  @ApiOperation({ summary: 'List all AI engines (API key masked as hasKey)' })
  async list() {
    const engines = await this.aiEngineService.list();
    return AiEngineMapper.toEngineList(engines);
  }

  @Post()
  @AdminOnly()
  @RequireCapability(CAPABILITY.AI_ENGINE_MANAGE)
  @ApiOperation({ summary: 'Register an AI engine (platform-wide or tenant-scoped)' })
  async create(@Body() body: CreateEngineRequest) {
    const engine = await this.aiEngineService.create(body);
    return AiEngineMapper.toEngine(engine);
  }

  @Patch(':id')
  @AdminOnly()
  @RequireCapability(CAPABILITY.AI_ENGINE_MANAGE)
  @ApiOperation({ summary: 'Update an AI engine (re-encrypts key if provided)' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateEngineRequest) {
    const engine = await this.aiEngineService.update(id, body);
    return AiEngineMapper.toEngine(engine);
  }

  @Delete(':id')
  @AdminOnly()
  @RequireCapability(CAPABILITY.AI_ENGINE_MANAGE)
  @ApiOperation({ summary: 'Delete an AI engine' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.aiEngineService.remove(id);
    return { deleted: true };
  }
}
