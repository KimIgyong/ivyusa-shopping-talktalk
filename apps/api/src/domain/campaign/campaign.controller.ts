import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal } from '@ivy/types';
import { buildPagination, normalizePage } from '@ivy/common';
import { CampaignService } from './campaign.service';
import { CreateCampaignRequest, UpdateCampaignRequest } from './campaign.dto';
import { toCampaignResponse } from './campaign.mapper';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { Paginated } from '../../global/interceptor/transform.interceptor';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Marketing campaign admin endpoints (FR-045). */
@ApiTags('Campaign')
@Controller('campaigns')
export class CampaignController {
  constructor(private readonly campaignService: CampaignService) {}

  @Get()
  @RequireCapability(CAPABILITY.CAMPAIGN_SEND)
  @ApiOperation({ summary: 'List campaigns' })
  async list(
    @CurrentUser() user: Principal,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const { page: p, size: s } = normalizePage(page, size);
    const [items, total] = await this.campaignService.listAll(this.tenantId(user), p, s);
    return new Paginated(items.map(toCampaignResponse), buildPagination(p, s, total));
  }

  @Post()
  @RequireCapability(CAPABILITY.CAMPAIGN_SEND)
  @ApiOperation({ summary: 'Create a draft campaign' })
  async create(@CurrentUser() user: Principal, @Body() body: CreateCampaignRequest) {
    const campaign = await this.campaignService.create(this.tenantId(user), body);
    return toCampaignResponse(campaign);
  }

  @Patch(':id')
  @RequireCapability(CAPABILITY.CAMPAIGN_SEND)
  @ApiOperation({ summary: 'Update campaign fields' })
  async update(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCampaignRequest,
  ) {
    const campaign = await this.campaignService.update(this.tenantId(user), id, body);
    return toCampaignResponse(campaign);
  }

  @Post(':id/send')
  @RequireCapability(CAPABILITY.CAMPAIGN_SEND)
  @ApiOperation({ summary: 'Send a campaign (dispatches to segment)' })
  async send(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const campaign = await this.campaignService.send(this.tenantId(user), id);
    return toCampaignResponse(campaign);
  }

  private tenantId(user: Principal): number {
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return user.tenantId;
  }
}
