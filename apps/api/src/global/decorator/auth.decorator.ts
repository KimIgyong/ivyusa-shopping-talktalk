import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AdminLevel, UserRank, Capability } from '@ivy/types';
import { JwtAuthGuard } from '../guard/jwt-auth.guard';
import { AuthorizationGuard } from '../guard/authorization.guard';

export const REQUIRE_CAPABILITY_KEY = 'requireCapability';
export const ALLOWED_ACTOR_KEY = 'allowedActor';
export const REQUIRE_RANK_KEY = 'requireRank';
export const REQUIRE_ADMIN_LEVEL_KEY = 'requireAdminLevel';

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

/** Tenant Master (or higher ranks listed). */
export function RequireRank(...ranks: UserRank[]) {
  return applyDecorators(
    SetMetadata(ALLOWED_ACTOR_KEY, ['user']),
    SetMetadata(REQUIRE_RANK_KEY, ranks),
    UseGuards(JwtAuthGuard, AuthorizationGuard),
    ApiBearerAuth(),
  );
}
