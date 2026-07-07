import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal } from '@ivy/types';
import { buildPagination, normalizePage } from '@ivy/common';
import { CustomerService } from './customer.service';
import { CustomerMapper } from './customer.mapper';
import { ListCustomersQuery, UpdateCustomerRequest } from './dto/request/customer.request';
import { Paginated } from '../../global/interceptor/transform.interceptor';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

@ApiTags('Customer')
@Controller('customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  @RequireCapability(CAPABILITY.CUSTOMER_MANAGE)
  @ApiOperation({ summary: 'List customers (tenant-scoped, paginated)' })
  async list(@CurrentUser() user: Principal, @Query() query: ListCustomersQuery) {
    const tenantId = this.tenantId(user);
    const { page, size } = normalizePage(query.page, query.size);
    const { items, total, stats } = await this.customerService.list(
      tenantId,
      page,
      size,
      query.email,
    );
    return new Paginated(
      CustomerMapper.toCustomerList(items, stats),
      buildPagination(page, size, total),
    );
  }

  @Get(':id')
  @RequireCapability(CAPABILITY.CUSTOMER_MANAGE)
  @ApiOperation({ summary: 'Get a customer by id (tenant-scoped)' })
  async get(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const tenantId = this.tenantId(user);
    const customer = await this.customerService.findById(tenantId, id);
    return CustomerMapper.toCustomer(customer);
  }

  @Patch(':id')
  @RequireCapability(CAPABILITY.CUSTOMER_MANAGE)
  @ApiOperation({ summary: 'Update a customer (name/tier)' })
  async update(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCustomerRequest,
  ) {
    const tenantId = this.tenantId(user);
    const customer = await this.customerService.update(tenantId, id, {
      name: body.name,
      tier: body.tier,
    });
    return CustomerMapper.toCustomer(customer);
  }

  private tenantId(user: Principal): number {
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return user.tenantId;
  }
}
