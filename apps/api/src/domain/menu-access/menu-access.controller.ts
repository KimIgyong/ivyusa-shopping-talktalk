import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Principal } from '@ivy/types';
import { Auth } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { asTenantUser } from '../user/user-principal.util';
import { MenuAccessService } from './menu-access.service';

@ApiTags('MenuAccess')
@Controller('menu-access')
export class MenuAccessController {
  constructor(private readonly menuAccessService: MenuAccessService) {}

  /**
   * The console asks for this on load and renders its nav from the answer, so
   * what a user sees and what the API will actually serve them come from the
   * same judgement (PLN-260812 S1).
   */
  @Get('me')
  @Auth()
  @ApiOperation({ summary: 'Menus the signed-in tenant user can reach' })
  async myMenus(@CurrentUser() principal: Principal) {
    const user = asTenantUser(principal);
    return { menus: await this.menuAccessService.effectiveMenus(user) };
  }
}
