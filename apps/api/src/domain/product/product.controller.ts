import { Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal } from '@ivy/types';
import { buildPagination, normalizePage } from '@ivy/common';
import { ProductService } from './product.service';
import { ProductSyncService } from './product-sync.service';
import { toProductCardResponse, toProductDetailResponse } from './product.mapper';
import { Public } from '../../global/decorator/public.decorator';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { SessionToken } from '../../global/decorator/session-token.decorator';
import { Paginated } from '../../global/interceptor/transform.interceptor';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { SessionService } from '../session/session.service';

/**
 * Customer-facing catalog endpoints (PLN-260807-IvyusaApp-Revamp F1, A-3).
 * Public + session-token identified — the session row carries the tenant scope.
 */
@ApiTags('Product')
@Controller('products')
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly sessionService: SessionService,
  ) {}

  @Get('categories')
  @Public()
  @ApiOperation({ summary: "Distinct categories of the tenant's active products" })
  async categories(@SessionToken() token: string) {
    const session = await this.sessionService.findByToken(token);
    return this.productService.categories(session.tenantId);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'List active products (search q on title/tags, category filter)' })
  async list(
    @SessionToken() token: string,
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const session = await this.sessionService.findByToken(token);
    const { page: p, size: s } = normalizePage(page, size);
    const [items, total] = await this.productService.list(session.tenantId, q, category, p, s);
    return new Paginated(items.map(toProductCardResponse), buildPagination(p, s, total));
  }

  // Path-param route LAST so it never shadows the static routes above.
  @Get(':handle')
  @Public()
  @ApiOperation({ summary: 'Product detail by handle' })
  async detail(@SessionToken() token: string, @Param('handle') handle: string) {
    const session = await this.sessionService.findByToken(token);
    const product = await this.productService.detail(session.tenantId, handle);
    return toProductDetailResponse(product);
  }
}

/** Tenant-console catalog operations (manual sync trigger). */
@ApiTags('Product')
@Controller('admin/products')
export class ProductAdminController {
  constructor(private readonly syncService: ProductSyncService) {}

  @Post('sync')
  @RequireCapability(CAPABILITY.MODULE_OPERATIONS)
  @ApiOperation({ summary: 'Trigger a storefront catalog sync for the tenant (admin)' })
  async sync(@CurrentUser() user: Principal) {
    return this.syncService.syncTenantById(this.tenantId(user));
  }

  private tenantId(user: Principal): number {
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return user.tenantId;
  }
}
