import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { NudgeService } from './nudge.service';
import { toNudgeCardResponse } from './nudge.mapper';
import { Public } from '../../global/decorator/public.decorator';
import { CreateNudgeRequest } from './dto/request/nudge.request';

/**
 * "Please buy me this" nudge endpoints (PLN-260807 F2, A-5). Create is
 * customer-bound (401 for anonymous sessions, enforced in the service); the
 * card view is deliberately session-free — recipients may be strangers.
 */
@ApiTags('Nudge')
@Controller('nudges')
export class NudgeController {
  constructor(private readonly nudgeService: NudgeService) {}

  @Post()
  @Public()
  @ApiOperation({ summary: 'Create a nudge share card for a catalog product (requires auth)' })
  async create(@Body() body: CreateNudgeRequest) {
    return this.nudgeService.create(body.session_token, body.product_handle, body.message);
  }

  @Get(':code')
  @Public()
  @ApiOperation({ summary: 'Public nudge card by share code (no session; counts a view)' })
  async view(@Param('code') code: string) {
    const { nudge, senderName, product } = await this.nudgeService.viewByCode(code);
    return toNudgeCardResponse(nudge, senderName, product);
  }
}
