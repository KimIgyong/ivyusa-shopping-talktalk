import { Controller, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal } from '@ivy/types';
import { ShopifySyncService } from './shopify-sync.service';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Tenant-scoped Shopify data sync (orders/customers → local cache). */
@ApiTags('Tenant')
@Controller('tenants/me/shopify')
export class ShopifySyncController {
  constructor(private readonly syncService: ShopifySyncService) {}

  @Post('sync')
  @RequireCapability(CAPABILITY.INTEGRATION_CREDENTIALS_MANAGE)
  @ApiOperation({ summary: 'Sync orders/customers from the Shopify Admin API into the cache' })
  async sync(@CurrentUser() user: Principal) {
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return this.syncService.syncOrders(user.tenantId);
  }

  @Post('register-webhooks')
  @RequireCapability(CAPABILITY.INTEGRATION_CREDENTIALS_MANAGE)
  @ApiOperation({ summary: 'Subscribe the store to order/fulfillment webhooks' })
  async registerWebhooks(@CurrentUser() user: Principal) {
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return this.syncService.registerWebhooks(user.tenantId);
  }
}
