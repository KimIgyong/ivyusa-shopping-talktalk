import { Controller, Get, HttpStatus, Logger, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, CJM_STAGE, Principal } from '@ivy/types';
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
import { EventBusService, EVENTS } from '../../infrastructure/infrastructure.module';

/** Recommendation rail sizing (A-10): default 10 cards, hard cap 20. */
const RECO_DEFAULT_SIZE = 10;
const RECO_MAX_SIZE = 20;

/**
 * Customer-facing catalog endpoints (PLN-260807-IvyusaApp-Revamp F1, A-3).
 * Public + session-token identified — the session row carries the tenant scope.
 */
@ApiTags('Product')
@Controller('products')
export class ProductController {
  private readonly logger = new Logger(ProductController.name);

  constructor(
    private readonly productService: ProductService,
    private readonly sessionService: SessionService,
    private readonly bus: EventBusService,
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

  // Static route — MUST stay above GET /products/:handle or it gets shadowed.
  @Get('recommendations')
  @Public()
  @ApiOperation({ summary: 'Deterministic recommendations v1 (saved-signal rules, A-10)' })
  async recommendations(@SessionToken() token: string, @Query('size') size?: string) {
    const session = await this.sessionService.findByToken(token);
    const parsed = Number(size);
    const s =
      Number.isFinite(parsed) && parsed > 0
        ? Math.min(Math.floor(parsed), RECO_MAX_SIZE)
        : RECO_DEFAULT_SIZE;
    const rows = await this.productService.recommendations(
      session.tenantId,
      session.customerId ?? null,
      s,
    );
    return rows.map(toProductCardResponse);
  }

  // Path-param route LAST so it never shadows the static routes above.
  @Get(':handle')
  @Public()
  @ApiOperation({ summary: 'Product detail by handle' })
  async detail(@SessionToken() token: string, @Param('handle') handle: string) {
    const session = await this.sessionService.findByToken(token);
    const product = await this.productService.detail(session.tenantId, handle);
    // Journey breadcrumb (PLN-260807 F3, A-7): the diary timeline's Browse stage.
    // Fire-and-forget — a bus hiccup must never block or fail the product read.
    void this.bus
      .publish(EVENTS.CJM, {
        tenantId: session.tenantId,
        sessionId: session.id,
        customerId: session.customerId ?? null,
        stage: CJM_STAGE.BROWSE,
        eventType: 'product_view',
        payload: { handle },
      })
      .catch((e) => this.logger.warn(`product_view CJM emit failed: ${(e as Error).message}`));
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
