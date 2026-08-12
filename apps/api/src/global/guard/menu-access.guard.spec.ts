import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MENU, Principal } from '@ivy/types';
import { MenuAccessGuard } from './menu-access.guard';
import { MenuAccessService } from '../../domain/menu-access/menu-access.service';
import { BusinessException } from '../exception/business.exception';
import { IS_PUBLIC_KEY } from '../decorator/public.decorator';
import { REQUIRE_MENU_KEY } from '../decorator/auth.decorator';

const TENANT_USER: Principal = {
  actorType: 'user',
  userId: 7,
  tenantId: 1,
  email: 'staff@shop.test',
  rank: 'staff',
  labels: [],
};

const ADMIN: Principal = { actorType: 'admin', adminId: 1, email: 'a@p.test', level: 'admin' };

function ctxFor(user?: Principal): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

/** Reflector stub keyed by metadata key. */
function reflectorWith(meta: Record<string, unknown>): Reflector {
  return {
    getAllAndOverride: (key: string) => meta[key],
  } as unknown as Reflector;
}

function serviceWith(effective: string[], provided: string[] = effective): MenuAccessService {
  return {
    effectiveMenus: jest.fn(async () => effective),
    providedMenus: jest.fn(async () => provided),
  } as unknown as MenuAccessService;
}

describe('MenuAccessGuard', () => {
  it('passes routes with no menu requirement', async () => {
    const guard = new MenuAccessGuard(reflectorWith({}), serviceWith([]));
    await expect(guard.canActivate(ctxFor(TENANT_USER))).resolves.toBe(true);
  });

  it('passes public routes even when the class carries a gate', async () => {
    const guard = new MenuAccessGuard(
      reflectorWith({ [IS_PUBLIC_KEY]: true, [REQUIRE_MENU_KEY]: [MENU.ORDERS] }),
      serviceWith([]),
    );
    await expect(guard.canActivate(ctxFor(undefined))).resolves.toBe(true);
  });

  it('does not gate platform admins — their access is decided by admin level', async () => {
    const service = serviceWith([]);
    const guard = new MenuAccessGuard(reflectorWith({ [REQUIRE_MENU_KEY]: [MENU.ORDERS] }), service);
    await expect(guard.canActivate(ctxFor(ADMIN))).resolves.toBe(true);
    expect(service.effectiveMenus).not.toHaveBeenCalled();
  });

  it('allows a tenant user holding the menu', async () => {
    const guard = new MenuAccessGuard(
      reflectorWith({ [REQUIRE_MENU_KEY]: [MENU.ORDERS] }),
      serviceWith([MENU.ORDERS, MENU.DASHBOARD]),
    );
    await expect(guard.canActivate(ctxFor(TENANT_USER))).resolves.toBe(true);
  });

  it('allows when any one of several required menus is held', async () => {
    const guard = new MenuAccessGuard(
      reflectorWith({ [REQUIRE_MENU_KEY]: [MENU.ISSUES, MENU.LIVE_CHAT] }),
      serviceWith([MENU.LIVE_CHAT]),
    );
    await expect(guard.canActivate(ctxFor(TENANT_USER))).resolves.toBe(true);
  });

  it('reports E5029 when the tenant is not provisioned the menu', async () => {
    const guard = new MenuAccessGuard(
      reflectorWith({ [REQUIRE_MENU_KEY]: [MENU.STATISTICS] }),
      serviceWith([MENU.DASHBOARD], [MENU.DASHBOARD]),
    );
    await expect(guard.canActivate(ctxFor(TENANT_USER))).rejects.toMatchObject({
      errorCode: 'E5029',
    });
  });

  it('reports E5030 when the tenant has it but this member does not', async () => {
    const guard = new MenuAccessGuard(
      reflectorWith({ [REQUIRE_MENU_KEY]: [MENU.STATISTICS] }),
      // Provisioned to the tenant, absent from this user's effective set.
      serviceWith([MENU.DASHBOARD], [MENU.DASHBOARD, MENU.STATISTICS]),
    );
    await expect(guard.canActivate(ctxFor(TENANT_USER))).rejects.toBeInstanceOf(BusinessException);
    await expect(guard.canActivate(ctxFor(TENANT_USER))).rejects.toMatchObject({
      errorCode: 'E5030',
    });
  });
});
