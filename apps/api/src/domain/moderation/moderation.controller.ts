import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CAPABILITY, Principal } from '@ivy/types';
import { ContentFilterRule } from './entity/content-filter-rule.entity';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { CreateRuleRequest } from './dto/request/moderation.request';

/** Content filter rule management (FR-069). Master/Director via AI_SETTINGS_MANAGE. */
@ApiTags('Moderation')
@Controller('moderation/rules')
export class ModerationController {
  constructor(
    @InjectRepository(ContentFilterRule) private readonly ruleRepo: Repository<ContentFilterRule>,
  ) {}

  @Get()
  @RequireCapability(CAPABILITY.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'List content filter rules (tenant)' })
  async list(@CurrentUser() user: Principal) {
    const tenantId = user.actorType === 'user' ? user.tenantId : 0;
    return this.ruleRepo.find({ where: { tenantId }, order: { id: 'DESC' } });
  }

  @Post()
  @RequireCapability(CAPABILITY.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Create a content filter rule' })
  async create(@CurrentUser() user: Principal, @Body() body: CreateRuleRequest) {
    const tenantId = user.actorType === 'user' ? user.tenantId : 0;
    const rule = this.ruleRepo.create({
      tenantId,
      scope: body.scope,
      type: body.type,
      patternOrPrompt: body.pattern_or_prompt,
      lang: body.lang ?? null,
      severity: body.severity ?? 'high',
      action: body.action ?? 'block',
      isActive: 1,
    });
    return this.ruleRepo.save(rule);
  }

  @Delete(':id')
  @RequireCapability(CAPABILITY.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Delete a content filter rule' })
  async remove(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const tenantId = user.actorType === 'user' ? user.tenantId : 0;
    await this.ruleRepo.delete({ id, tenantId });
    return { deleted: true };
  }
}
