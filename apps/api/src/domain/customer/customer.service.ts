import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Like, Repository } from 'typeorm';
import { Customer } from './entity/customer.entity';
import { OrderCache } from '../order/entity/order-cache.entity';
import { CustomerOrderStats } from './customer.mapper';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Customer detail shown in the agent console context panel (FR-045). */
export interface CustomerContext {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  tier: string;
  recentOrders: { id: number; status: string | null; total: number | null; createdAt: Date }[];
}

/** Loose lead fields captured during a live chat to create a new customer. */
export interface CustomerLead {
  name?: string;
  email?: string;
  phone?: string;
}

/** Customer cache + tenancy/tier management (FR-057). All queries tenant-scoped. */
@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    @InjectRepository(OrderCache) private readonly orderRepo: Repository<OrderCache>,
  ) {}

  async list(
    tenantId: number,
    page: number,
    size: number,
    email?: string,
  ): Promise<{ items: Customer[]; total: number; stats: Map<string, CustomerOrderStats> }> {
    const where: FindOptionsWhere<Customer> = { tenantId };
    if (email) where.email = Like(`%${email}%`);
    const [items, total] = await this.customerRepo.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    const stats = await this.orderStats(
      tenantId,
      items.map((c) => c.id),
    );
    return { items, total, stats };
  }

  /** Aggregate order count + total spent per customer from orders_cache. */
  private async orderStats(
    tenantId: number,
    customerIds: number[],
  ): Promise<Map<string, CustomerOrderStats>> {
    const map = new Map<string, CustomerOrderStats>();
    if (customerIds.length === 0) return map;
    const rows = await this.orderRepo
      .createQueryBuilder('o')
      .select('o.customerId', 'customerId')
      .addSelect('COUNT(*)', 'orders')
      .addSelect('COALESCE(SUM(o.total), 0)', 'totalSpent')
      // A representative currency for the total (customers are typically single-currency).
      .addSelect('MAX(o.currency)', 'currency')
      .where('o.tenantId = :tenantId', { tenantId })
      .andWhere('o.customerId IN (:...customerIds)', { customerIds })
      .groupBy('o.customerId')
      .getRawMany<{
        customerId: string | number;
        orders: string;
        totalSpent: string;
        currency: string | null;
      }>();
    for (const r of rows) {
      // bigint ids arrive as strings; key by String to match the entity's id.
      map.set(String(r.customerId), {
        orders: Number(r.orders) || 0,
        totalSpent: Number(r.totalSpent) || 0,
        currency: r.currency ?? null,
      });
    }
    return map;
  }

  async findById(tenantId: number, id: number): Promise<Customer> {
    const customer = await this.customerRepo.findOne({ where: { id, tenantId } });
    if (!customer) {
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    return customer;
  }

  /** Full context (profile + recent orders) for the agent console panel. */
  async getContext(tenantId: number, customerId: number): Promise<CustomerContext> {
    const customer = await this.findById(tenantId, customerId);
    const orders = await this.orderRepo.find({
      where: { tenantId, customerId },
      order: { createdAt: 'DESC' },
      take: 5,
    });
    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      tier: customer.tier,
      recentOrders: orders.map((o) => ({
        id: o.id,
        status: o.statusUi ?? o.statusInternal,
        total: o.total,
        createdAt: o.createdAt,
      })),
    };
  }

  /** Display names keyed by String(id), for enriching lists that reference customers. */
  async namesByIds(tenantId: number, ids: number[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (ids.length === 0) return map;
    const rows = await this.customerRepo.find({ where: { tenantId, id: In(ids) } });
    for (const c of rows) {
      if (c.name) map.set(String(c.id), c.name);
    }
    return map;
  }

  /** Match candidates for the "link existing customer" search (email or name). */
  async searchByEmailOrName(tenantId: number, query: string, limit = 10): Promise<Customer[]> {
    const q = query.trim();
    if (!q) return [];
    return this.customerRepo.find({
      where: [
        { tenantId, email: Like(`%${q}%`) },
        { tenantId, name: Like(`%${q}%`) },
      ],
      order: { id: 'DESC' },
      take: limit,
    });
  }

  /** Create a customer from chat-captured lead fields. Reuses the email row if present. */
  async createFromLead(tenantId: number, lead: CustomerLead): Promise<Customer> {
    const email = lead.email?.trim() || null;
    if (email) {
      const existing = await this.customerRepo.findOne({ where: { tenantId, email } });
      if (existing) {
        let dirty = false;
        if (lead.name && existing.name !== lead.name) {
          existing.name = lead.name;
          dirty = true;
        }
        if (lead.phone && existing.phone !== lead.phone) {
          existing.phone = lead.phone;
          dirty = true;
        }
        return dirty ? this.customerRepo.save(existing) : existing;
      }
    }
    const customer = this.customerRepo.create({
      tenantId,
      email,
      name: lead.name?.trim() || null,
      phone: lead.phone?.trim() || null,
      tier: 'guest',
    });
    return this.customerRepo.save(customer);
  }

  async update(
    tenantId: number,
    id: number,
    changes: { name?: string; tier?: string },
  ): Promise<Customer> {
    const customer = await this.findById(tenantId, id);
    if (changes.name !== undefined) customer.name = changes.name;
    if (changes.tier !== undefined) customer.tier = changes.tier;
    return this.customerRepo.save(customer);
  }

  /** Lookup-or-create by email within a tenant. Shared with other modules. */
  async findOrCreateByEmail(
    tenantId: number,
    email: string,
    name?: string,
    shopifyCustomerId?: string,
  ): Promise<Customer> {
    const existing = await this.customerRepo.findOne({ where: { tenantId, email } });
    if (existing) {
      let dirty = false;
      if (name !== undefined && existing.name !== name) {
        existing.name = name;
        dirty = true;
      }
      if (shopifyCustomerId !== undefined && existing.shopifyCustomerId !== shopifyCustomerId) {
        existing.shopifyCustomerId = shopifyCustomerId;
        dirty = true;
      }
      return dirty ? this.customerRepo.save(existing) : existing;
    }
    const customer = this.customerRepo.create({
      tenantId,
      email,
      name: name ?? null,
      shopifyCustomerId: shopifyCustomerId ?? null,
      tier: 'guest',
    });
    return this.customerRepo.save(customer);
  }

  /**
   * Lookup-or-create by Shopify customer id within a tenant. Used when a logged-in
   * storefront customer is resolved via the app proxy (we have the numeric Shopify
   * id but not necessarily an email). Reuses the row synced from orders, if any.
   */
  async findOrCreateByShopifyId(
    tenantId: number,
    shopifyCustomerId: string,
  ): Promise<Customer> {
    const existing = await this.customerRepo.findOne({
      where: { tenantId, shopifyCustomerId },
    });
    if (existing) return existing;
    const customer = this.customerRepo.create({
      tenantId,
      email: null,
      name: null,
      shopifyCustomerId,
      tier: 'guest',
    });
    return this.customerRepo.save(customer);
  }
}
