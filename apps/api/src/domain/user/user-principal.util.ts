import { HttpStatus } from '@nestjs/common';
import { Principal } from '@ivy/types';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** The tenant-user variant of {@link Principal}. */
export type TenantUser = Extract<Principal, { actorType: 'user' }>;

/**
 * Narrow a {@link Principal} to the tenant-user variant. Routes here are guarded
 * to user actors, but this gives the compiler the narrowing and a hard runtime
 * guarantee that tenantId/userId are present.
 */
export function asTenantUser(principal: Principal): TenantUser {
  if (principal.actorType !== 'user') {
    throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
  }
  return principal;
}
