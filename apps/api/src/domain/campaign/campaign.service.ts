import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign } from './entity/campaign.entity';
import { CreateCampaignRequest, UpdateCampaignRequest } from './campaign.dto';
import { EventBusService, EVENTS } from '../../infrastructure/infrastructure.module';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Marketing campaigns (FR-045) — tenant admin authoring + dispatch. */
@Injectable()
export class CampaignService {
  constructor(
    @InjectRepository(Campaign) private readonly campaignRepo: Repository<Campaign>,
    private readonly bus: EventBusService,
  ) {}

  async listAll(tenantId: number, page: number, size: number): Promise<[Campaign[], number]> {
    return this.campaignRepo.findAndCount({
      where: { tenantId },
      order: { id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
  }

  async create(tenantId: number, input: CreateCampaignRequest): Promise<Campaign> {
    return this.campaignRepo.save(
      this.campaignRepo.create({
        tenantId,
        name: input.name,
        segmentRef: input.segment_ref ?? null,
        content: input.content ?? null,
        status: 'draft',
      }),
    );
  }

  async update(tenantId: number, id: number, input: UpdateCampaignRequest): Promise<Campaign> {
    const campaign = await this.requireCampaign(tenantId, id);
    if (input.name !== undefined) campaign.name = input.name;
    if (input.segment_ref !== undefined) campaign.segmentRef = input.segment_ref;
    if (input.content !== undefined) campaign.content = input.content;
    if (input.status !== undefined) campaign.status = input.status;
    return this.campaignRepo.save(campaign);
  }

  async send(tenantId: number, id: number): Promise<Campaign> {
    const campaign = await this.requireCampaign(tenantId, id);
    campaign.status = 'sent';
    campaign.sentAt = new Date();
    const saved = await this.campaignRepo.save(campaign);
    await this.bus.publish(EVENTS.CAMPAIGN_DISPATCH, {
      campaignId: saved.id,
      segmentRef: saved.segmentRef,
    });
    return saved;
  }

  private async requireCampaign(tenantId: number, id: number): Promise<Campaign> {
    const campaign = await this.campaignRepo.findOne({ where: { id, tenantId } });
    if (!campaign) throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    return campaign;
  }
}
