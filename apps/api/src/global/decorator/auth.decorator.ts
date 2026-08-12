import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AdminLevel, UserRank, Capability, MenuCode } from '@ivy/types';
import { JwtAuthGuard } from '../guard/jwt-auth.guard';
import { AuthorizationGuard } from '../guard/authorization.guard';
import { MenuAccessGuard } from '../guard/menu-access.guard';

export const REQUIRE_CAPABILITY_KEY = 'requireCapability';
export const ALLOWED_ACTOR_KEY = 'allowedActor';
export const REQUIRE_RANK_KEY = 'requireRank';
export const REQUIRE_ADMIN_LEVEL_KEY = 'requireAdminLevel';
export const MASTER_OR_ADMIN_KEY = 'masterOrAdmin';
export const REQUIRE_MENU_KEY = 'requireMenu';

/** Base authenticated route: JWT + authorization guard. */
export function Auth() {
  return applyDecorators(UseGuards(JwtAuthGuard, AuthorizationGuard), ApiBearerAuth());
}

/** Require a specific capability (rank × label matrix). Implies Auth. */
export function RequireCapability(...capabilities: Capability[]) {
  return applyDecorators(
    SetMetadata(REQUIRE_CAPABILITY_KEY, capabilities),
    UseGuards(JwtAuthGuard, AuthorizationGuard),
    ApiBearerAuth(),
  );
}

/** System-admin only (any level). */
export function AdminOnly(...levels: AdminLevel[]) {
  return applyDecorators(
    SetMetadata(ALLOWED_ACTOR_KEY, ['admin']),
    SetMetadata(REQUIRE_ADMIN_LEVEL_KEY, levels),
    UseGuards(JwtAuthGuard, AuthorizationGuard),
    ApiBearerAuth(),
  );
}

/** System admin (any level) OR tenant Master — standard parity alias. */
export function MasterOrAdmin() {
  return applyDecorators(
    SetMetadata(MASTER_OR_ADMIN_KEY, true),
    UseGuards(JwtAuthGuard, AuthorizationGuard),
    ApiBearerAuth(),
  );
}

/** Tenant Master (or higher ranks listed). */
export function RequireRank(...ranks: UserRank[]) {
  return applyDecorators(
    SetMetadata(ALLOWED_ACTOR_KEY, ['user']),
    SetMetadata(REQUIRE_RANK_KEY, ranks),
    UseGuards(JwtAuthGuard, AuthorizationGuard),
    ApiBearerAuth(),
  );
}

/**
 * Require the tenant user to have access to at least one of these console
 * screens (PLN-260812 S4). Composes with the rank/capability decorators rather
 * than replacing them: menu access is which screens a member reaches, the
 * capability matrix is what they may do once inside.
 *
 * Apply it only where a route belongs to ONE screen. Several endpoints are
 * shared (the dashboard reads the orders API; live chat opens issues), and a
 * gate that breaks an allowed screen is worse than a gate that is missing —
 * see the route inventory in TCR-260812.
 *
 * Adds no authentication of its own: JwtAuthGuard is global, so `req.user` is
 * already resolved and @Public routes stay public.
 */
export function RequireMenu(...menus: MenuCode[]) {
  return applyDecorators(SetMetadata(REQUIRE_MENU_KEY, menus), UseGuards(MenuAccessGuard));
}
