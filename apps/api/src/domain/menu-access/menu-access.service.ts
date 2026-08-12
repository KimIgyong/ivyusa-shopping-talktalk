import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  isMenuCode,
  JobLabel,
  MENU_ACCESS_MODE,
  MENU_PROVISION_MODE,
  MenuCode,
  USER_RANK,
  UserPrincipal,
  UserRank,
} from '@ivy/types';
import {
  DEFAULT_ROLE_MENUS,
  resolveEffectiveMenus,
  resolveProvidedMenus,
  RoleMenuRow,
  TenantMenuOverride,
  UserMenuRow,
} from '@ivy/common';
import { RedisService } from '../../infrastructure/cache/redis.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { AuditService } from '../audit/audit.service';
import { Tenant } from '../tenant/entity/tenant.entity';
import { User } from '../user/entity/user.entity';
import { TenantMenu } from './entity/tenant-menu.entity';
import { TenantRoleMenu } from './entity/tenant-role-menu.entity';
import { TenantUserMenu } from './entity/tenant-user-menu.entity';
import {
  MenuAccessMapper,
  RoleMatrixView,
  TenantMenusView,
  UserOverridesView,
} from './menu-access.mapper';

/**
 * Menu access resolution (PLN-260812-Menu-Provisioning-Access).
 *
 * The console's left nav, its route guard and the API's own menu gate all read
 * their answer from here, so there is one judgement rather than a client-side
 * opinion and a server-side one that drift apart.
 *
 * Caching is versioned per tenant rather than time-based alone: a permission
 * change the operator cannot see take effect is indistinguishable from a bug,
 * so every write bumps the tenant version and strands the old user entries.
 */
@Injectable()
export class MenuAccessService {
  private readonly logger = new Logger(MenuAccessService.name);
  private static readonly CACHE_TTL_SEC = 300;

  constructor(
    @InjectRepository(TenantMenu)
    private readonly tenantMenuRepo: Repository<TenantMenu>,
    @InjectRepository(TenantRoleMenu)
    private readonly roleMenuRepo: Repository<TenantRoleMenu>,
    @InjectRepository(TenantUserMenu)
    private readonly userMenuRepo: Repository<TenantUserMenu>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  /** Menus the tenant is entitled to: plan preset + platform-admin overrides. */
  async providedMenus(tenantId: number): Promise<MenuCode[]> {
    const [tenant, overrides] = await Promise.all([
      this.tenantRepo.findOne({ where: { id: tenantId } }),
      this.tenantMenuRepo.find({ where: { tenantId } }),
    ]);
    return resolveProvidedMenus(tenant?.plan ?? null, this.toOverrides(overrides));
  }

  /** Platform-admin view of one tenant's provisioning: plan, overrides, result. */
  async tenantMenusView(tenantUuid: string): Promise<TenantMenusView> {
    const tenant = await this.getTenantByUuid(tenantUuid);
    const rows = await this.tenantMenuRepo.find({ where: { tenantId: Number(tenant.id) } });
    const overrides = this.toOverrides(rows);
    return MenuAccessMapper.toTenantMenus({
      tenantUuid: tenant.uuid,
      tenantName: tenant.name,
      plan: tenant.plan,
      planMenus: resolveProvidedMenus(tenant.plan ?? null),
      overrides: new Map(overrides.map((o) => [o.menuCode, o.provided])),
      provided: resolveProvidedMenus(tenant.plan ?? null, overrides),
    });
  }

  /**
   * Replace a tenant's provisioning overrides wholesale (the console always
   * sends every catalog row). Rows are rewritten inside one transaction so a
   * half-applied save cannot leave a tenant with a menu set nobody chose.
   */
  async saveTenantMenus(
    tenantUuid: string,
    items: readonly { menu_code: string; mode: string }[],
    adminId: number,
  ): Promise<TenantMenusView> {
    const tenant = await this.getTenantByUuid(tenantUuid);
    const tenantId = Number(tenant.id);

    const overrides = items
      .filter((i) => isMenuCode(i.menu_code) && i.mode !== MENU_PROVISION_MODE.PLAN)
      .map((i) => ({ menuCode: i.menu_code, provided: i.mode === MENU_PROVISION_MODE.ON }));

    await this.tenantMenuRepo.manager.transaction(async (trx) => {
      await trx.delete(TenantMenu, { tenantId });
      if (overrides.length) {
        await trx.insert(
          TenantMenu,
          overrides.map((o) => ({ tenantId, menuCode: o.menuCode, provided: o.provided ? 1 : 0 })),
        );
      }
    });

    await this.invalidate(tenantId);
    await this.audit.write({
      tenantId,
      actorType: 'admin',
      actorId: adminId,
      action: 'tenant_menus.update',
      target: `tenant:${tenant.uuid}`,
      metadata: {
        plan: tenant.plan,
        overrides: Object.fromEntries(overrides.map((o) => [o.menuCode, o.provided ? 'on' : 'off'])),
      },
    });

    return this.tenantMenusView(tenantUuid);
  }

  /** Rows behind the tenant console's rank matrix (absent rows = code default). */
  async roleRows(tenantId: number): Promise<RoleMenuRow[]> {
    const rows = await this.roleMenuRepo.find({ where: { tenantId } });
    return rows
      .filter((r) => isMenuCode(r.menuCode))
      .map((r) => ({ rank: r.rank as UserRank, menuCode: r.menuCode as MenuCode, allowed: r.allowed === 1 }));
  }

  /** Per-user exceptions for one member. */
  async userRows(tenantId: number, userId: number): Promise<UserMenuRow[]> {
    const rows = await this.userMenuRepo.find({ where: { tenantId, userId } });
    return rows
      .filter((r) => isMenuCode(r.menuCode))
      .map((r) => ({ menuCode: r.menuCode as MenuCode, allowed: r.allowed === 1 }));
  }

  /** Tenant console view of its own rank matrix. */
  async roleMatrixView(tenantId: number): Promise<RoleMatrixView> {
    const [provided, roleRows] = await Promise.all([
      this.providedMenus(tenantId),
      this.roleRows(tenantId),
    ]);
    return MenuAccessMapper.toRoleMatrix({
      provided,
      ranks: Object.values(USER_RANK),
      masterRank: USER_RANK.MASTER,
      roleRows,
    });
  }

  /**
   * Replace the tenant's rank matrix. Rows equal to the built-in default are
   * dropped rather than stored, so a tenant that never really diverged keeps
   * following the product default when that default changes.
   */
  async saveRoleMatrix(
    tenantId: number,
    rows: readonly { rank: string; menu_code: string; allowed: boolean }[],
    actorUserId: number,
  ): Promise<RoleMatrixView> {
    const changed = rows
      .filter((r) => isMenuCode(r.menu_code) && r.rank !== USER_RANK.MASTER)
      .filter((r) => {
        const fallback = DEFAULT_ROLE_MENUS[r.rank as UserRank]?.includes(r.menu_code as MenuCode);
        return r.allowed !== fallback;
      });

    await this.roleMenuRepo.manager.transaction(async (trx) => {
      await trx.delete(TenantRoleMenu, { tenantId });
      if (changed.length) {
        await trx.insert(
          TenantRoleMenu,
          changed.map((r) => ({
            tenantId,
            rank: r.rank,
            menuCode: r.menu_code,
            allowed: r.allowed ? 1 : 0,
          })),
        );
      }
    });

    await this.invalidate(tenantId);
    await this.audit.write({
      tenantId,
      actorType: 'user',
      actorId: actorUserId,
      action: 'menu_access.roles_update',
      metadata: { changedCount: changed.length },
    });

    return this.roleMatrixView(tenantId);
  }

  /** Tenant console view of every member's exceptions. */
  async userOverridesView(tenantId: number): Promise<UserOverridesView> {
    const [provided, users, rows] = await Promise.all([
      this.providedMenus(tenantId),
      this.userRepo.find({ where: { tenantId }, order: { id: 'ASC' } }),
      this.userMenuRepo.find({ where: { tenantId } }),
    ]);

    const rowsByUser = new Map<string, { menuCode: MenuCode; allowed: boolean }[]>();
    for (const row of rows) {
      if (!isMenuCode(row.menuCode)) continue;
      const key = String(row.userId);
      const list = rowsByUser.get(key) ?? [];
      list.push({ menuCode: row.menuCode as MenuCode, allowed: row.allowed === 1 });
      rowsByUser.set(key, list);
    }

    return MenuAccessMapper.toUserOverrides({ provided, users, rowsByUser });
  }

  /** Replace one member's exceptions. */
  async saveUserOverrides(
    tenantId: number,
    targetUserId: number,
    items: readonly { menu_code: string; mode: string }[],
    actorUserId: number,
  ): Promise<UserOverridesView> {
    // Scoped by tenant, not just id: without this a master could address a
    // member of another tenant by guessing a user id.
    const target = await this.userRepo.findOne({ where: { id: targetUserId, tenantId } });
    if (!target) {
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    if (target.rank === USER_RANK.MASTER) {
      // Master is exempt from this layer, so a stored row would be dead data
      // that reads like a rule someone can rely on.
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }

    const overrides = items
      .filter((i) => isMenuCode(i.menu_code) && i.mode !== MENU_ACCESS_MODE.DEFAULT)
      .map((i) => ({ menuCode: i.menu_code, allowed: i.mode === MENU_ACCESS_MODE.ALLOW }));

    await this.userMenuRepo.manager.transaction(async (trx) => {
      await trx.delete(TenantUserMenu, { tenantId, userId: targetUserId });
      if (overrides.length) {
        await trx.insert(
          TenantUserMenu,
          overrides.map((o) => ({
            tenantId,
            userId: targetUserId,
            menuCode: o.menuCode,
            allowed: o.allowed ? 1 : 0,
          })),
        );
      }
    });

    await this.invalidate(tenantId);
    await this.audit.write({
      tenantId,
      actorType: 'user',
      actorId: actorUserId,
      action: 'menu_access.user_update',
      target: `user:${targetUserId}`,
      metadata: {
        overrides: Object.fromEntries(
          overrides.map((o) => [o.menuCode, o.allowed ? 'allow' : 'deny']),
        ),
      },
    });

    return this.userOverridesView(tenantId);
  }

  /** Menus this signed-in tenant user actually sees. Cached per user. */
  async effectiveMenus(user: UserPrincipal): Promise<MenuCode[]> {
    const cacheKey = await this.cacheKey(user.tenantId, user.userId);
    if (cacheKey) {
      const hit = await this.redis.get(cacheKey);
      if (hit) {
        try {
          return (JSON.parse(hit) as string[]).filter(isMenuCode);
        } catch {
          // A malformed entry is not worth failing a request over; recompute.
        }
      }
    }

    const menus = await this.computeEffectiveMenus(user);
    if (cacheKey) {
      await this.redis.set(cacheKey, JSON.stringify(menus), MenuAccessService.CACHE_TTL_SEC);
    }
    return menus;
  }

  /** Single-menu check for the API-side gate. */
  async canAccess(user: UserPrincipal, menu: MenuCode): Promise<boolean> {
    return (await this.effectiveMenus(user)).includes(menu);
  }

  /**
   * Invalidate every cached answer for a tenant. Called by all three write
   * paths (provisioning, rank matrix, user exception) — a saved change that
   * only appears five minutes later reads as a broken save.
   */
  async invalidate(tenantId: number): Promise<void> {
    if (!this.redis.available()) return;
    await this.redis.incr(this.versionKey(tenantId));
  }

  private async computeEffectiveMenus(user: UserPrincipal): Promise<MenuCode[]> {
    const [provided, roleRows, userRows] = await Promise.all([
      this.providedMenus(user.tenantId),
      this.roleRows(user.tenantId),
      this.userRows(user.tenantId, user.userId),
    ]);
    return resolveEffectiveMenus({
      provided,
      rank: user.rank as UserRank,
      labels: (user.labels ?? []) as JobLabel[],
      roleRows,
      userRows,
    });
  }

  /** Tenants are addressed by UUID in admin URLs; the numeric PK never leaks. */
  private async getTenantByUuid(uuid: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({ where: { uuid } });
    if (!tenant) {
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    return tenant;
  }

  private toOverrides(rows: TenantMenu[]): TenantMenuOverride[] {
    return rows
      .filter((r) => isMenuCode(r.menuCode))
      .map((r) => ({ menuCode: r.menuCode as MenuCode, provided: r.provided === 1 }));
  }

  private versionKey(tenantId: number): string {
    return `menuacc:v:${tenantId}`;
  }

  /** Null when Redis is down — the caller then computes without caching. */
  private async cacheKey(tenantId: number, userId: number): Promise<string | null> {
    if (!this.redis.available()) return null;
    const version = (await this.redis.get(this.versionKey(tenantId))) ?? '0';
    return `menuacc:u:${userId}:${version}`;
  }
}
