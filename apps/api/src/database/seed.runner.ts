import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { Logger } from '@nestjs/common';
import { BCRYPT_ROUNDS } from '../global/constant/security.constant';
import { Tenant } from '../domain/tenant/entity/tenant.entity';
import { AdminUser } from '../domain/auth/entity/admin-user.entity';
import { User } from '../domain/user/entity/user.entity';
import { JobLabel } from '../domain/user/entity/job-label.entity';
import { UserJobLabel } from '../domain/user/entity/user-job-label.entity';
import { AiEngine } from '../domain/ai-engine/entity/ai-engine.entity';
import { TenantAiSetting } from '../domain/ai-engine/entity/tenant-ai-setting.entity';
import { TenantAiConfig } from '../domain/ai-engine/entity/tenant-ai-config.entity';
import { DEFAULT_PERSONA, DEFAULT_SCENARIO_BUTTONS } from '../domain/ai-engine/ai-config.service';
import { ContentFilterRule } from '../domain/moderation/entity/content-filter-rule.entity';
import { KnowledgeSource } from '../domain/knowledge/entity/knowledge-source.entity';
import { KbDocument } from '../domain/knowledge/entity/kb-document.entity';
import { Customer } from '../domain/customer/entity/customer.entity';
import { OrderCache } from '../domain/order/entity/order-cache.entity';
import { OrderItem } from '../domain/order/entity/order-item.entity';
import { Fulfillment } from '../domain/order/entity/fulfillment.entity';
import { Notification } from '../domain/notification/entity/notification.entity';
import { IntegrationStatusEntity } from '../domain/integration/entity/integration-status.entity';

const AI_FUNCTIONS = ['chat', 'rag', 'summary', 'assist', 'moderation'];

export interface SeedOptions {
  /** Bootstrap password for admin@ / dev@ (default from SEED_PASSWORD or 'amb2026!@'). */
  password?: string;
  /** Seed demo customer/orders/notifications (default true; set false for clean prod). */
  includeDemoData?: boolean;
}

/**
 * Idempotent bootstrap seed (FR-062) operating on an existing DataSource. Used by
 * the CLI (`npm run db:seed`) and the optional SEED_ON_BOOT hook in main.ts so
 * staging/production can self-bootstrap without ts-node in the runtime image.
 */
export async function runSeed(ds: DataSource, opts: SeedOptions = {}): Promise<void> {
  const logger = new Logger('Seed');
  const password = opts.password ?? process.env.SEED_PASSWORD ?? 'amb2026!@';
  const includeDemoData = opts.includeDemoData ?? process.env.SEED_DEMO_DATA !== 'false';
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const tenantRepo = ds.getRepository(Tenant);
  let tenant = await tenantRepo.findOne({ where: { name: 'ivyusa' } });
  if (!tenant) {
    tenant = await tenantRepo.save(
      tenantRepo.create({ shopDomain: 'ivyusa.myshopify.com', name: 'ivyusa', status: 'active', plan: 'custom' }),
    );
  }

  // System admin + tenant master — bootstrap credentials (re)asserted each run.
  const adminRepo = ds.getRepository(AdminUser);
  const admin =
    (await adminRepo.findOne({ where: { email: 'admin@amoeba.group' } })) ??
    adminRepo.create({ email: 'admin@amoeba.group', level: 'super_admin', status: 'active' });
  admin.passwordHash = hash;
  admin.mustChangePassword = 1;
  await adminRepo.save(admin);

  const userRepo = ds.getRepository(User);
  const master =
    (await userRepo.findOne({ where: { tenantId: tenant.id, email: 'dev@amoeba.group' } })) ??
    userRepo.create({ tenantId: tenant.id, email: 'dev@amoeba.group', name: 'Master Owner', rank: 'master', status: 'active' });
  master.passwordHash = hash;
  master.mustChangePassword = 1;
  await userRepo.save(master);

  // Job labels + assign all to master
  const labelRepo = ds.getRepository(JobLabel);
  const ujlRepo = ds.getRepository(UserJobLabel);
  for (const [code, name] of [['consult', '상담'], ['accounting', '회계'], ['operations', '운영']]) {
    let label = await labelRepo.findOne({ where: { tenantId: tenant.id, code } });
    if (!label) label = await labelRepo.save(labelRepo.create({ tenantId: tenant.id, code, name }));
    if (!(await ujlRepo.findOne({ where: { userId: master.id, jobLabelId: label.id } }))) {
      await ujlRepo.save(ujlRepo.create({ userId: master.id, jobLabelId: label.id }));
    }
  }

  // AI engines: platform stub default + anthropic
  const engineRepo = ds.getRepository(AiEngine);
  let stub = await engineRepo.findOne({ where: { provider: 'stub', isDefault: 1 } });
  if (!stub) {
    stub = await engineRepo.save(
      engineRepo.create({ tenantId: null, provider: 'stub', name: 'Built-in Stub', model: 'stub-1', capabilities: 'chat,rag,summary,assist,moderation', status: 'enabled', isDefault: 1 }),
    );
  }
  if (!(await engineRepo.findOne({ where: { provider: 'anthropic' } }))) {
    await engineRepo.save(
      engineRepo.create({ tenantId: null, provider: 'anthropic', name: 'Anthropic Claude', model: 'claude-opus-4-8', capabilities: 'chat,rag,summary,assist,moderation', status: 'enabled', isDefault: 0 }),
    );
  }

  const settingRepo = ds.getRepository(TenantAiSetting);
  for (const fn of AI_FUNCTIONS) {
    if (!(await settingRepo.findOne({ where: { tenantId: tenant.id, func: fn } }))) {
      await settingRepo.save(settingRepo.create({ tenantId: tenant.id, func: fn, engineId: stub.id, paramsJson: { temperature: 0.3 } }));
    }
  }

  const ruleRepo = ds.getRepository(ContentFilterRule);
  if ((await ruleRepo.count({ where: { tenantId: tenant.id } })) === 0) {
    await ruleRepo.save([
      ruleRepo.create({ tenantId: tenant.id, scope: 'both', type: 'word', patternOrPrompt: 'guarantee', severity: 'med', action: 'warn', isActive: 1 }),
      ruleRepo.create({ tenantId: tenant.id, scope: 'both', type: 'context', patternOrPrompt: 'Flag medical/legal advice or unverifiable refund promises.', severity: 'high', action: 'block', isActive: 1 }),
    ]);
  }

  const ksRepo = ds.getRepository(KnowledgeSource);
  let ks = await ksRepo.findOne({ where: { tenantId: tenant.id, type: 'board' } });
  if (!ks) ks = await ksRepo.save(ksRepo.create({ tenantId: tenant.id, type: 'board', name: 'IVY Help Center', status: 'active', designated: 1 }));
  const kbRepo = ds.getRepository(KbDocument);
  if ((await kbRepo.count({ where: { tenantId: tenant.id } })) === 0) {
    const docs = [
      ['policy', 'Shipping & Delivery', 'Orders ship within 1-2 business days. Standard delivery is 3-5 business days in the US. You can track your order from the Orders panel once it ships.'],
      ['policy', 'Returns & Exchanges', 'Items can be returned within 7 days of receipt if unopened and unused. Opened or out-of-window items require a support agent. (POL-005)'],
      ['warranty', 'Warranty (Electronics & Hair Tools)', 'Electronics and hair tools include a category-specific limited warranty. Other categories follow the general return/refund policy. (POL-006)'],
      ['faq', 'Order Cancellation', 'Orders can be canceled before they enter preparing status. After shipping, please request a return instead.'],
      ['product', 'Product Usage & Ingredients', 'Product usage instructions and full ingredient lists are available on each product detail page and in this help center.'],
    ];
    for (const [category, title, content] of docs) {
      const doc = await kbRepo.save(kbRepo.create({ tenantId: tenant.id, sourceId: ks.id, source: 'knowledge_store', category, title, content, active: 1, status: 'embedded' }));
      doc.embeddingRef = `emb_${doc.id}`;
      await kbRepo.save(doc);
    }
  }

  // Tenant AI config: persona, response rules, scenario buttons (FR-047/FN-040)
  const aiConfigRepo = ds.getRepository(TenantAiConfig);
  if (!(await aiConfigRepo.findOne({ where: { tenantId: tenant.id } }))) {
    await aiConfigRepo.save(
      aiConfigRepo.create({
        tenantId: tenant.id,
        persona: DEFAULT_PERSONA,
        rules: [
          'Be concise, friendly, and professional.',
          'Answer only from the knowledge base; never invent policies.',
          'Offer to connect a human agent when unsure or out of scope.',
        ],
        scenarioButtons: DEFAULT_SCENARIO_BUTTONS,
      }),
    );
  }

  const intRepo = ds.getRepository(IntegrationStatusEntity);
  for (const name of ['shopify', 'fulfillment', 'klaviyo', 'odoo', 'google_drive']) {
    if (!(await intRepo.findOne({ where: { name } }))) {
      await intRepo.save(intRepo.create({ name, status: 'connected', detail: 'Seeded (mock)' }));
    }
  }

  if (includeDemoData) {
    const customerRepo = ds.getRepository(Customer);
    let customer = await customerRepo.findOne({ where: { tenantId: tenant.id, email: 'shopper@example.com' } });
    if (!customer) {
      customer = await customerRepo.save(
        customerRepo.create({ tenantId: tenant.id, email: 'shopper@example.com', name: 'Demo Shopper', tier: 'regular', shopifyCustomerId: 'shopify-cust-1' }),
      );
    }
    const orderRepo = ds.getRepository(OrderCache);
    const itemRepo = ds.getRepository(OrderItem);
    const fulfillRepo = ds.getRepository(Fulfillment);
    if ((await orderRepo.count({ where: { customerId: customer.id } })) === 0) {
      const o1 = await orderRepo.save(orderRepo.create({ shopifyOrderId: 'shopify-1001', customerId: customer.id, orderNumber: 'IVY-1001', statusInternal: 'shipping', statusUi: 'In Transit', total: 79.0, currency: 'USD' }));
      await itemRepo.save(itemRepo.create({ orderId: o1.id, productId: 'prod-burgundy', title: 'IVY Signature Hair Tool', optionText: 'Burgundy / 6-8', qty: 1, price: 79.0 }));
      await fulfillRepo.save(fulfillRepo.create({ orderId: o1.id, status: 'in_transit', trackingNumber: '1Z999AA10123456784', carrier: 'UPS' }));
      const o2 = await orderRepo.save(orderRepo.create({ shopifyOrderId: 'shopify-1002', customerId: customer.id, orderNumber: 'IVY-1002', statusInternal: 'delivered', statusUi: 'Delivered', total: 32.5, currency: 'USD' }));
      await itemRepo.save(itemRepo.create({ orderId: o2.id, productId: 'prod-serum', title: 'IVY Repair Serum', optionText: '50ml', qty: 1, price: 32.5 }));
      await fulfillRepo.save(fulfillRepo.create({ orderId: o2.id, status: 'delivered', trackingNumber: '1Z999AA10123456785', carrier: 'UPS' }));
    }
    const notifRepo = ds.getRepository(Notification);
    if ((await notifRepo.count({ where: { customerId: customer.id } })) === 0) {
      await notifRepo.save([
        notifRepo.create({ customerId: customer.id, category: 'shipping', title: 'Your order is on the way', body: 'IVY-1001 shipped via UPS.', statusBadge: 'In Transit', channel: 'in_app' }),
        notifRepo.create({ customerId: customer.id, category: 'review', title: 'How was your order?', body: 'Leave a review for IVY-1002.', statusBadge: 'Review', channel: 'in_app' }),
      ]);
    }
  }

  // Backfill tenant_id on tenant-scoped tables (rows created outside a request context).
  const tenantScopedTables = [
    'sessions', 'conversations', 'messages', 'orders_cache', 'order_items',
    'fulfillments', 'notifications', 'notification_prefs', 'reviews', 'affiliates',
    'subscriptions', 'restock_subscriptions', 'inquiries', 'cjm_events', 'campaigns',
  ];
  for (const table of tenantScopedTables) {
    await ds.query(`UPDATE ${table} SET tenant_id = ? WHERE tenant_id IS NULL`, [tenant.id]);
  }

  logger.log('Seed complete (tenant=ivyusa, admin@amoeba.group / dev@amoeba.group).');
}
