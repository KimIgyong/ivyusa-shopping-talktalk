import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Like, Repository } from 'typeorm';
import { Customer } from './entity/customer.entity';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Customer cache + tenancy/tier management (FR-057). All queries tenant-scoped. */
@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
  ) {}

  async list(
    tenantId: number,
    page: number,
    size: number,
    email?: string,
  ): Promise<{ items: Customer[]; total: number }> {
    const where: FindOptionsWhere<Customer> = { tenantId };
    if (email) where.email = Like(`%${email}%`);
    const [items, total] = await this.customerRepo.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    return { items, total };
  }

  async findById(tenantId: number, id: number): Promise<Customer> {
    const customer = await this.customerRepo.findOne({ where: { id, tenantId } });
    if (!customer) {
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    return customer;
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
}
