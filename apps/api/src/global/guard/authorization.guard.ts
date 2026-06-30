import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminLevel, UserRank, Capability, Principal } from '@ivy/types';
import { adminCan, userCan } from '@ivy/common';
import {
  ALLOWED_ACTOR_KEY,
  MASTER_OR_ADMIN_KEY,
  REQUIRE_ADMIN_LEVEL_KEY,
  REQUIRE_CAPABILITY_KEY,
  REQUIRE_RANK_KEY,
} from '../decorator/auth.decorator';
import { USER_RANK } from '@ivy/types';
import { BusinessException } from '../exception/business.exception';
import { ERROR_CODE } from '../constant/error-code.constant';

/**
 * Authorization layer (runs after JwtAuthGuard). Enforces, in order:
 *  - allowed actor type (admin vs tenant user),
 *  - admin level (super_admin/admin),
 *  - tenant-user rank,
 *  - capability (rank × label matrix — @ivy/common).
 * Deny by default (FR-056).
 */
@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const get = <T>(key: string): T | undefined =>
      this.reflector.getAllAndOverride<T>(key, [ctx.getHandler(), ctx.getClass()]);

    const user = ctx.switchToHttp().getRequest().user as Principal | undefined;
    if (!user) throw new BusinessException(ERROR_CODE.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);

    const allowedActors = get<string[]>(ALLOWED_ACTOR_KEY);
    if (allowedActors && !allowedActors.includes(user.actorType)) {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }

    // @MasterOrAdmin(): any system admin OR a tenant Master.
    if (get<boolean>(MASTER_OR_ADMIN_KEY)) {
      const ok = user.actorType === 'admin' || (user.actorType === 'user' && user.rank === USER_RANK.MASTER);
      if (!ok) throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
      return true;
    }

    if (user.actorType === 'admin') {
      const levels = get<AdminLevel[]>(REQUIRE_ADMIN_LEVEL_KEY);
      if (levels && levels.length && !levels.includes(user.level)) {
        throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
      }
      const caps = get<Capability[]>(REQUIRE_CAPABILITY_KEY);
      if (caps && !caps.every((c) => adminCan(user.level, c))) {
        throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
      }
      return true;
    }

    // tenant user
    const ranks = get<UserRank[]>(REQUIRE_RANK_KEY);
    if (ranks && ranks.length && !ranks.includes(user.rank)) {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    const caps = get<Capability[]>(REQUIRE_CAPABILITY_KEY);
    if (caps && !caps.every((c) => userCan(user.rank, user.labels, c))) {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
