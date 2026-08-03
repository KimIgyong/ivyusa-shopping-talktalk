import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HttpStatus } from '@nestjs/common';
import { CAPABILITY, Principal, USER_RANK } from '@ivy/types';
import { buildPagination, normalizePage } from '@ivy/common';
import { TenantService } from './tenant.service';
import { EcommerceIntegrationService } from './ecommerce-integration.service';
import { TenantMapper } from './tenant.mapper';
import {
  CreateTenantRequest,
  ListTenantsQuery,
  UpdateIntegrationRequest,
  UpdatePrivacyNoticeRequest,
  UpdateShopifySettingsRequest,
  UpdateWidgetSettingsRequest,
  UpdateTenantStatusRequest,
  UpsertCredentialRequest,
} from './dto/request/tenant.request';
import { Paginated } from '../../global/interceptor/transform.interceptor';
import { AdminOnly, RequireCapability, RequireRank } from '../../global/decorator/auth.decorator';
import { Public } from '../../global/decorator/public.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

@ApiTags('Tenant')
@Controller('tenants')
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly ecommerceIntegrationService: EcommerceIntegrationService,
  ) {}

  @Get()
  @AdminOnly()
  @ApiOperation({ summary: 'List tenants (paginated)' })
  async list(@Query() query: ListTenantsQuery) {
    const { page, size } = normalizePage(query.page, query.size);
    const { items, total } = await this.tenantService.list(page, size, query.status);
    const counts = await this.tenantService.countUsersByTenant(items.map((t) => Number(t.id)));
    return new Paginated(TenantMapper.toTenantList(items, counts), buildPagination(page, size, total));
  }

  @Get('by-slug/:slug')
  @Public()
  @ApiOperation({ summary: 'Resolve a tenant login page by slug (display-safe fields only)' })
  async getBySlug(@Param('slug') slug: string) {
    const tenant = await this.tenantService.findBySlug(slug);
    if (!tenant) {
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    return TenantMapper.toPublicTenant(tenant);
  }

  // NOTE: declared before ':uuid' so 'privacy-notice' is not captured as a UUID.
  @Get('privacy-notice')
  @RequireRank(USER_RANK.MASTER, USER_RANK.DIRECTOR)
  @ApiOperation({ summary: 'Get this tenant privacy-notice settings (PLN-Privacy-Control-Gap Stage 2)' })
  async getPrivacyNotice(@CurrentUser() user: Principal) {
    const tenant = await this.tenantService.findById(this.tenantId(user));
    return TenantMapper.toPrivacyNotice(tenant);
  }

  @Patch('privacy-notice')
  @RequireRank(USER_RANK.MASTER, USER_RANK.DIRECTOR)
  @ApiOperation({ summary: 'Update this tenant privacy-policy URL / consent-notice version' })
  async updatePrivacyNotice(
    @CurrentUser() user: Principal,
    @Body() body: UpdatePrivacyNoticeRequest,
  ) {
    // @RequireRank guarantees a tenant user at runtime; narrow for TS.
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    const tenant = await this.tenantService.updatePrivacyNotice(user.tenantId, user.userId, body);
    return TenantMapper.toPrivacyNotice(tenant);
  }

  // NOTE: declared before ':uuid' so 'widget-settings' is not captured as a UUID.
  @Get('widget-settings')
  @RequireRank(USER_RANK.MASTER, USER_RANK.DIRECTOR)
  @ApiOperation({ summary: 'Get this tenant widget behavior settings (sign-in mode)' })
  async getWidgetSettings(@CurrentUser() user: Principal) {
    const tenant = await this.tenantService.findById(this.tenantId(user));
    return TenantMapper.toWidgetSettings(tenant);
  }

  @Patch('widget-settings')
  @RequireRank(USER_RANK.MASTER, USER_RANK.DIRECTOR)
  @ApiOperation({ summary: 'Update this tenant widget sign-in mode (redirect/popup)' })
  async updateWidgetSettings(
    @CurrentUser() user: Principal,
    @Body() body: UpdateWidgetSettingsRequest,
  ) {
    // @RequireRank guarantees a tenant user at runtime; narrow for TS.
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    const tenant = await this.tenantService.updateWidgetSettings(user.tenantId, user.userId, body);
    return TenantMapper.toWidgetSettings(tenant);
  }

  @Get(':uuid')
  @AdminOnly()
  @ApiOperation({ summary: 'Get a tenant by UUID' })
  async get(@Param('uuid') uuid: string) {
    const tenant = await this.tenantService.getByUuid(uuid);
    return TenantMapper.toTenant(tenant);
  }

  @Post()
  @RequireCapability(CAPABILITY.TENANT_APPROVE)
  @ApiOperation({ summary: 'Create (approve) a tenant' })
  async create(@Body() body: CreateTenantRequest) {
    const tenant = await this.tenantService.create(body.shop_domain, body.name, body.plan, body.slug);
    return TenantMapper.toTenant(tenant);
  }

  @Patch(':uuid/status')
  @AdminOnly()
  @ApiOperation({ summary: 'Update tenant status (applied/active/suspended)' })
  async updateStatus(
    @Param('uuid') uuid: string,
    @Body() body: UpdateTenantStatusRequest,
  ) {
    const target = await this.tenantService.getByUuid(uuid);
    const tenant = await this.tenantService.updateStatus(Number(target.id), body.status);
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

  @Get('me/shopify')
  @RequireCapability(CAPABILITY.INTEGRATION_CREDENTIALS_MANAGE)
  @ApiOperation({ summary: 'Get this tenant Shopify connection settings' })
  async getShopify(@CurrentUser() user: Principal) {
    const { tenant, cred, status } = await this.tenantService.getShopifyView(this.tenantId(user));
    return TenantMapper.toShopifySettings(tenant, cred, status);
  }

  @Put('me/shopify')
  @RequireCapability(CAPABILITY.INTEGRATION_CREDENTIALS_MANAGE)
  @ApiOperation({ summary: 'Save this tenant Shopify shop domain and credentials' })
  async saveShopify(
    @CurrentUser() user: Principal,
    @Body() body: UpdateShopifySettingsRequest,
  ) {
    const { tenant, cred, status } = await this.tenantService.saveShopify(this.tenantId(user), body);
    return TenantMapper.toShopifySettings(tenant, cred, status);
  }

  @Post('me/shopify/test')
  @RequireCapability(CAPABILITY.INTEGRATION_CREDENTIALS_MANAGE)
  @ApiOperation({ summary: 'Test Shopify Admin API connectivity and record status' })
  async testShopify(@CurrentUser() user: Principal) {
    return this.tenantService.testShopify(this.tenantId(user));
  }

  @Get('me/integrations/:provider')
  @RequireCapability(CAPABILITY.INTEGRATION_CREDENTIALS_MANAGE)
  @ApiOperation({ summary: 'Get this tenant e-commerce integration settings (cafe24/woocommerce/odoo/haravan)' })
  async getIntegration(@CurrentUser() user: Principal, @Param('provider') provider: string) {
    return this.ecommerceIntegrationService.getSettings(this.tenantId(user), provider);
  }

  @Put('me/integrations/:provider')
  @RequireCapability(CAPABILITY.INTEGRATION_CREDENTIALS_MANAGE)
  @ApiOperation({ summary: 'Save this tenant e-commerce integration credentials' })
  async saveIntegration(
    @CurrentUser() user: Principal,
    @Param('provider') provider: string,
    @Body() body: UpdateIntegrationRequest,
  ) {
    return this.ecommerceIntegrationService.save(this.tenantId(user), provider, body.config ?? {});
  }

  @Post('me/integrations/:provider/test')
  @RequireCapability(CAPABILITY.INTEGRATION_CREDENTIALS_MANAGE)
  @ApiOperation({ summary: 'Test e-commerce integration connectivity and record status' })
  async testIntegration(@CurrentUser() user: Principal, @Param('provider') provider: string) {
    return this.ecommerceIntegrationService.test(this.tenantId(user), provider);
  }

  private tenantId(user: Principal): number {
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return user.tenantId;
  }
}
