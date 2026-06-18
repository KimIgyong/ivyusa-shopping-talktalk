import { Campaign } from './entity/campaign.entity';

/** Map a campaign row to the camelCase response shape. */
export function toCampaignResponse(c: Campaign) {
  return {
    id: c.id,
    name: c.name,
    segmentRef: c.segmentRef,
    content: c.content,
    status: c.status,
    scheduledAt: c.scheduledAt,
    sentAt: c.sentAt,
  };
}
