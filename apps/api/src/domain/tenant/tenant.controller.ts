import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HttpStatus } from '@nestjs/common';
import { CAPABILITY, Principal } from '@ivy/types';
import { buildPagination, normalizePage } from '@ivy/common';
import { TenantService } from './tenant.service';
import { TenantMapper } from './tenant.mapper';
import {
  CreateTenantRequest,
  ListTenantsQuery,
  UpdateTenantStatusRequest,
  UpsertCredentialRequest,
} from './dto/request/tenant.request';
import { Paginated } from '../../global/interceptor/transform.interceptor';
import { AdminOnly, RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

@ApiTags('Tenant')
@Controller('tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  @AdminOnly()
  @ApiOperation({ summary: 'List tenants (paginated)' })
  async list(@Query() query: ListTenantsQuery) {
    const { page, size } = normalizePage(query.page, query.size);
    const { items, total } = await this.tenantService.list(page, size, query.status);
    return new Paginated(TenantMapper.toTenantList(items), buildPagination(page, size, total));
  }

  @Get(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Get a tenant by id' })
  async get(@Param('id', ParseIntPipe) id: number) {
    const tenant = await this.tenantService.findById(id);
    return TenantMapper.toTenant(tenant);
  }

  @Post()
  @RequireCapability(CAPABILITY.TENANT_APPROVE)
  @ApiOperation({ summary: 'Create (approve) a tenant' })
  async create(@Body() body: CreateTenantRequest) {
    const tenant = await this.tenantService.create(body.shop_domain, body.name, body.plan);
    return TenantMapper.toTenant(tenant);
  }

  @Patch(':id/status')
  @AdminOnly()
  @ApiOperation({ summary: 'Update tenant status (applied/active/suspended)' })
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateTenantStatusRequest,
  ) {
    const tenant = await this.tenantService.updateStatus(id, body.status);
    return TenantMapper.toTenant(tenant);
  }

  @Get('me/credentials')
  @RequireCapability(CAPABILITY.INTEGRATION_CREDENTIALS_MANAGE)
  @ApiOperation({ summary: 'List this tenant integration credential statuses' })
  async listCredentials(@CurrentUser() user: Principal) {
    const tenantId = this.tenantId(user);
    const creds = await this.tenantService.listCredentials(tenantId);
    return TenantMapper.toCredentialList(creds);
  }

  @Put('me/credentials/:provider')
  @RequireCapability(CAPABILITY.INTEGRATION_CREDENTIALS_MANAGE)
  @ApiOperation({ summary: 'Upsert this tenant credential for a provider' })
  async upsertCredential(
    @CurrentUser() user: Principal,
    @Param('provider') provider: string,
    @Body() body: UpsertCredentialRequest,
  ) {
    const tenantId = this.tenantId(user);
    const cred = await this.tenantService.upsertCredential(tenantId, provider, body.secret);
    return TenantMapper.toCredential(cred);
  }

  private tenantId(user: Principal): number {
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return user.tenantId;
  }
}
