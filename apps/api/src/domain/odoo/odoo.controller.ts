import { Controller, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal } from '@ivy/types';
import { OdooProductSyncService } from './odoo-product-sync.service';
import { RequireCapability, RequireMenu } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Tenant-scoped Odoo sync (console, authenticated). Products only for now (REQ-260826). */
@ApiTags('Tenant')
@Controller('tenants/me/odoo')
@RequireMenu('settings')
export class OdooController {
  constructor(private readonly productSyncService: OdooProductSyncService) {}

  private tenantId(user: Principal): number {
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return user.tenantId;
  }

  /**
   * Pull the Odoo catalogue into products_cache. Kept separate from the knowledge
   * conversion (POST /knowledge/documents/import/catalog) so the operator previews
   * what the conversion would write before it runs — same contract as Cafe24.
   */
  @Post('products/sync')
  @RequireCapability(CAPABILITY.INTEGRATION_CREDENTIALS_MANAGE)
  @ApiOperation({ summary: 'Pull the Odoo catalogue into products_cache' })
  async syncProducts(@CurrentUser() user: Principal) {
    return this.productSyncService.syncProducts(this.tenantId(user));
  }
}
