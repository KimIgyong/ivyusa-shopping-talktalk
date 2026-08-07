import { Repository } from 'typeorm';
import { CampaignService } from './campaign.service';
import { Campaign } from './entity/campaign.entity';
import { Customer } from '../customer/entity/customer.entity';
import { ProductCache } from '../product/entity/product-cache.entity';
import { EventBusService } from '../../infrastructure/infrastructure.module';
import { NotificationService } from '../notification/notification.service';
import { ModerationService } from '../moderation/moderation.service';
import { AuditService } from '../audit/audit.service';
import { BusinessException } from '../../global/exception/business.exception';

describe('CampaignService — deep-link validation + dispatch (PLN-260807 F4, A-9)', () => {
  let svc: CampaignService;
  let campaigns: Campaign[];
  let products: Array<Partial<ProductCache>>;
  let customers: Array<Partial<Customer>>;
  let notifyMock: jest.Mock;
  let busPublish: jest.Mock;
  let busHandlers: Map<string, (payload: unknown) => Promise<void>>;

  beforeEach(() => {
    campaigns = [];
    products = [];
    customers = [{ id: 1, tenantId: 1 }];
    busHandlers = new Map();
    busPublish = jest.fn();

    const campaignRepo = {
      findOne: jest.fn(async ({ where }: { where: { id: number; tenantId?: number } }) => {
        return (
          campaigns.find(
            (c) => c.id === where.id && (where.tenantId === undefined || c.tenantId === where.tenantId),
          ) ?? null
        );
      }),
      save: jest.fn(async (e: Campaign) => e),
    } as unknown as Repository<Campaign>;

    const customerRepo = {
      find: jest.fn(async () => customers as Customer[]),
    } as unknown as Repository<Customer>;

    const productRepo = {
      findOne: jest.fn(async ({ where }: { where: { tenantId: number; handle: string } }) => {
        return (
          (products.find((p) => p.tenantId === where.tenantId && p.handle === where.handle) as ProductCache) ??
          null
        );
      }),
    } as unknown as Repository<ProductCache>;

    const bus = {
      subscribe: jest.fn((event: string, handler: (p: unknown) => Promise<void>) => {
        busHandlers.set(event, handler);
      }),
      publish: busPublish,
    } as unknown as EventBusService;

    notifyMock = jest.fn(async () => [{}]);
    const notifications = { notify: notifyMock } as unknown as NotificationService;
    const moderation = {
      // Pass-through moderation: DELIVERED verdict, text unchanged.
      moderate: jest.fn(async ({ text }: { text: string }) => ({ decision: 'delivered', text })),
    } as unknown as ModerationService;
    const audit = { write: jest.fn() } as unknown as AuditService;

    svc = new CampaignService(campaignRepo, customerRepo, productRepo, bus, notifications, moderation, audit);
    svc.onModuleInit(); // registers the CAMPAIGN_DISPATCH consumer
  });

  const campaign = (over: Partial<Campaign>): Campaign => {
    const c = {
      id: 1,
      tenantId: 1,
      name: 'Launch',
      segmentRef: null,
      content: null,
      status: 'draft',
      scheduledAt: null,
      sentAt: null,
      ...over,
    } as Campaign;
    campaigns.push(c);
    return c;
  };

  const dispatch = async (campaignId: number): Promise<void> => {
    await busHandlers.get('campaign.dispatch')?.({ campaignId });
  };

  it('send: product link with an unknown handle → 400 VALIDATION_FAILED', async () => {
    campaign({ content: { link: { type: 'product', handle: 'nope' } } });
    await expect(svc.send(1, 1)).rejects.toThrow(BusinessException);
  });

  it('send: url link that is not https:// → 400 VALIDATION_FAILED', async () => {
    campaign({ content: { link: { type: 'url', url: 'http://insecure.example.com' } } });
    await expect(svc.send(1, 1)).rejects.toThrow(BusinessException);
  });

  it('send: valid product link passes and publishes CAMPAIGN_DISPATCH', async () => {
    products.push({ tenantId: 1, handle: 'apple-jam', productUrl: 'https://shop.example.com/products/apple-jam' });
    campaign({ content: { link: { type: 'product', handle: 'apple-jam' } } });
    const sent = await svc.send(1, 1);
    expect(sent.status).toBe('sent');
    expect(busPublish).toHaveBeenCalledWith('campaign.dispatch', expect.objectContaining({ campaignId: 1 }));
  });

  it('send: no link at all still sends (link is optional)', async () => {
    campaign({ content: { message: 'hello' } });
    await expect(svc.send(1, 1)).resolves.toMatchObject({ status: 'sent' });
  });

  it('dispatch: product link resolves catalog product_url + handle into notify()', async () => {
    products.push({ tenantId: 1, handle: 'apple-jam', productUrl: 'https://shop.example.com/products/apple-jam' });
    campaign({ content: { message: 'New jam!', link: { type: 'product', handle: 'apple-jam' } } });
    await dispatch(1);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 1,
        customerId: 1,
        category: 'event',
        linkUrl: 'https://shop.example.com/products/apple-jam',
        productHandle: 'apple-jam',
      }),
    );
  });

  it('dispatch: url link passes through as linkUrl with null productHandle', async () => {
    campaign({ content: { link: { type: 'url', url: 'https://shop.example.com/sale' } } });
    await dispatch(1);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ linkUrl: 'https://shop.example.com/sale', productHandle: null }),
    );
  });

  it('dispatch: no link → null link fields on notify()', async () => {
    campaign({ content: { message: 'plain' } });
    await dispatch(1);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ linkUrl: null, productHandle: null }),
    );
  });
});
