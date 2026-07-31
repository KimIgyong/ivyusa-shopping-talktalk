import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign } from './entity/campaign.entity';
import { Customer } from '../customer/entity/customer.entity';
import { CreateCampaignRequest, UpdateCampaignRequest } from './dto/request/campaign.request';
import { EventBusService, EVENTS } from '../../infrastructure/infrastructure.module';
import { NotificationService } from '../notification/notification.service';
import { ModerationService } from '../moderation/moderation.service';
import { MODERATION_DECISION } from '@ivy/types';
import { AuditService } from '../audit/audit.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Marketing campaigns (FR-045) — tenant admin authoring + dispatch. */
@Injectable()
export class CampaignService implements OnModuleInit {
  private readonly logger = new Logger(CampaignService.name);

  constructor(
    @InjectRepository(Campaign) private readonly campaignRepo: Repository<Campaign>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    private readonly bus: EventBusService,
    private readonly notifications: NotificationService,
    private readonly moderation: ModerationService,
    private readonly audit: AuditService,
  ) {}

  /** CAMPAIGN_DISPATCH consumer (PRV-M2): fan out through the pref-honoring notifier. */
  onModuleInit(): void {
    this.bus.subscribe(EVENTS.CAMPAIGN_DISPATCH, async (payload: unknown) => {
      const { campaignId } = payload as { campaignId?: number };
      if (campaignId) await this.dispatch(campaignId);
    });
  }

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

  /**
   * Deliver a sent campaign to the tenant's customers through
   * NotificationService.notify, which enforces each customer's channel
   * preferences — so a CCPA opt-out ("Do Not Sell or Share" = all external
   * channels off) is honored at the egress point (PRV-M2). External delivery
   * itself is still mocked; what matters is that opted-out customers get no
   * external-channel rows at all.
   */
  private async dispatch(campaignId: number): Promise<void> {
    const campaign = await this.campaignRepo.findOne({ where: { id: campaignId } });
    if (!campaign?.tenantId) return;

    // Announcement copy now reaches lock screens (mobile push) — run it through
    // the same non-bypassable outbound gate as chat (FR-069; PLN-MobileApp D-8).
    // Masked/rephrased output is what gets sent; a BLOCKED verdict aborts the
    // whole dispatch, audited (fail-safe).
    const rawBody = this.campaignBody(campaign.content);
    const [modTitle, modBody] = await Promise.all([
      this.moderation.moderate({
        tenantId: campaign.tenantId,
        scope: 'agent',
        authorType: 'agent',
        text: campaign.name,
      }),
      rawBody != null
        ? this.moderation.moderate({
            tenantId: campaign.tenantId,
            scope: 'agent',
            authorType: 'agent',
            text: rawBody,
          })
        : Promise.resolve(null),
    ]);
    if (
      modTitle.decision === MODERATION_DECISION.BLOCKED ||
      modBody?.decision === MODERATION_DECISION.BLOCKED
    ) {
      this.logger.warn(`campaign ${campaignId} dispatch blocked by moderation`);
      await this.audit.write({
        tenantId: campaign.tenantId,
        actorType: 'system',
        actorId: 0,
        action: 'campaign.blocked',
        target: `campaign:${campaignId}`,
        result: 'denied',
        metadata: { reason: 'moderation_blocked' },
      });
      return;
    }

    const customers = await this.customerRepo.find({ where: { tenantId: campaign.tenantId } });
    let externalDelivered = 0;
    let inAppOnly = 0;
    // Chunked fan-out (PLN-MobileApp M4): bounded concurrency instead of one
    // long sequential loop — a large tenant no longer serializes the dispatch.
    const CHUNK = 50;
    for (let i = 0; i < customers.length; i += CHUNK) {
      const results = await Promise.allSettled(
        customers.slice(i, i + CHUNK).map((customer) =>
          this.notifications.notify({
            tenantId: campaign.tenantId,
            customerId: customer.id,
            category: 'event',
            title: modTitle.text,
            body: modBody ? modBody.text : null,
          }),
        ),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') {
          // notify() always creates the in-app row; extra rows = enabled external channels.
          if (r.value.length > 1) externalDelivered += 1;
          else inAppOnly += 1;
        } else {
          this.logger.warn(`campaign ${campaignId} notify failed: ${String(r.reason)}`);
        }
      }
    }

    // Event-bus consumer (machine writer) — 'system' actor, not a phantom user (Stage 4).
    await this.audit.write({
      tenantId: campaign.tenantId,
      actorType: 'system',
      actorId: 0,
      action: 'campaign.dispatched',
      target: `campaign:${campaignId}`,
      metadata: { externalDelivered, inAppOnly },
    });
  }

  /** Campaign content is a JSON blob — surface its text field (or a dump) as the notification body. */
  private campaignBody(content: Record<string, unknown> | null): string | null {
    if (!content) return null;
    const text = content.text ?? content.body ?? content.message;
    return typeof text === 'string' ? text : JSON.stringify(content);
  }

  private async requireCampaign(tenantId: number, id: number): Promise<Campaign> {
    const campaign = await this.campaignRepo.findOne({ where: { id, tenantId } });
    if (!campaign) throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    return campaign;
  }
}
