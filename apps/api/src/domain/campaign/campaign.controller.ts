import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal } from '@ivy/types';
import { buildPagination, normalizePage } from '@ivy/common';
import { CampaignService } from './campaign.service';
import { CreateCampaignRequest, UpdateCampaignRequest } from './campaign.dto';
import { toCampaignResponse } from './campaign.mapper';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { Paginated } from '../../global/interceptor/transform.interceptor';

/** Marketing campaign admin endpoints (FR-045). */
@ApiTags('Campaign')
@Controller('campaigns')
export class CampaignController {
  constructor(private readonly campaignService: CampaignService) {}

  @Get()
  @RequireCapability(CAPABILITY.CAMPAIGN_SEND)
  @ApiOperation({ summary: 'List campaigns' })
  async list(
    @CurrentUser() _user: Principal,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const { page: p, size: s } = normalizePage(page, size);
    const [items, total] = await this.campaignService.listAll(p, s);
    return new Paginated(items.map(toCampaignResponse), buildPagination(p, s, total));
  }

  @Post()
  @RequireCapability(CAPABILITY.CAMPAIGN_SEND)
  @ApiOperation({ summary: 'Create a draft campaign' })
  async create(@CurrentUser() _user: Principal, @Body() body: CreateCampaignRequest) {
    const campaign = await this.campaignService.create(body);
    return toCampaignResponse(campaign);
  }

  @Patch(':id')
  @RequireCapability(CAPABILITY.CAMPAIGN_SEND)
  @ApiOperation({ summary: 'Update campaign fields' })
  async update(
    @CurrentUser() _user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCampaignRequest,
  ) {
    const campaign = await this.campaignService.update(id, body);
    return toCampaignResponse(campaign);
  }

  @Post(':id/send')
  @RequireCapability(CAPABILITY.CAMPAIGN_SEND)
  @ApiOperation({ summary: 'Send a campaign (dispatches to segment)' })
  async send(@CurrentUser() _user: Principal, @Param('id', ParseIntPipe) id: number) {
    const campaign = await this.campaignService.send(id);
    return toCampaignResponse(campaign);
  }
}
