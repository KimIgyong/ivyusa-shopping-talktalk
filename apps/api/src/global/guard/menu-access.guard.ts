import { CanActivate, ExecutionContext, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MenuCode, Principal } from '@ivy/types';
import { REQUIRE_MENU_KEY } from '../decorator/auth.decorator';
import { IS_PUBLIC_KEY } from '../decorator/public.decorator';
import { BusinessException } from '../exception/business.exception';
import { ERROR_CODE } from '../constant/error-code.constant';
import { MenuAccessService } from '../../domain/menu-access/menu-access.service';

/**
 * Screen-level gate (PLN-260812 S4).
 *
 * Hiding a menu in the sidebar is decoration: the URL still works and so does
 * the API behind it. This makes the same judgement the nav renders from
 * enforceable, so a withheld screen is actually withheld.
 *
 * Runs after the global JwtAuthGuard, so `req.user` is already resolved.
 * Skipped for public (storefront/widget) routes and for platform admins, whose
 * access is decided by admin level rather than any tenant's provisioning.
 */
@Injectable()
export class MenuAccessGuard implements CanActivate {
  private readonly logger = new Logger(MenuAccessGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly menuAccessService: MenuAccessService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) {
      return true;
    }

    // Method metadata wins over the controller's, so a class-wide gate can be
    // narrowed (or widened) on a single route.
    const required = this.reflector.getAllAndOverride<MenuCode[]>(REQUIRE_MENU_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return true;

    const user = ctx.switchToHttp().getRequest().user as Principal | undefined;
    if (!user || user.actorType !== 'user') return true;

    const menus = await this.menuAccessService.effectiveMenus(user);
    // Any-of: a route reachable from two screens stays reachable from either.
    if (required.some((code) => menus.includes(code))) return true;

    // 4xx are not server-logged by default, and "no error in the logs" is how a
    // wrongly-gated route hides (dev-kit lesson).
    this.logger.warn(
      `menu gate blocked ${user.email} (rank=${user.rank}) on [${required.join(',')}]`,
    );

    const provided = await this.menuAccessService.providedMenus(user.tenantId);
    const notProvided = required.every((code) => !provided.includes(code));
    throw new BusinessException(
      notProvided ? ERROR_CODE.MENU_NOT_PROVIDED : ERROR_CODE.MENU_ACCESS_DENIED,
      HttpStatus.FORBIDDEN,
    );
  }
}
