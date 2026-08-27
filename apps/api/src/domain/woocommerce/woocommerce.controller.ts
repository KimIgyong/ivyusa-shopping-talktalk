import { Controller, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal } from '@ivy/types';
import { WooProductSyncService } from './woocommerce-product-sync.service';
import { WooSyncService } from './woocommerce-sync.service';
import { RequireCapability, RequireMenu } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Tenant-scoped WooCommerce sync (console, authenticated). Products + orders (REQ-260826). */
@ApiTags('Tenant')
@Controller('tenants/me/woocommerce')
@RequireMenu('settings')
export class WooController {
  constructor(
    private readonly productSyncService: WooProductSyncService,
    private readonly syncService: WooSyncService,
  ) {}

  private tenantId(user: Principal): number {
    if (user.actorType !== 'user') throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    return user.tenantId;
  }

  @Post('products/sync')
  @RequireCapability(CAPABILITY.INTEGRATION_CREDENTIALS_MANAGE)
  @ApiOperation({ summary: 'Pull the WooCommerce catalogue into products_cache' })
  async syncProducts(@CurrentUser() user: Principal) {
    return this.productSyncService.syncProducts(this.tenantId(user));
  }

  @Post('sync')
  @RequireCapability(CAPABILITY.INTEGRATION_CREDENTIALS_MANAGE)
  @ApiOperation({ summary: 'Sync WooCommerce orders (+ buyers) into the cache' })
  async sync(@CurrentUser() user: Principal) {
    return this.syncService.syncOrders(this.tenantId(user));
  }
}
