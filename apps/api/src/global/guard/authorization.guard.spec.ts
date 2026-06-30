import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationGuard } from './authorization.guard';
import { BusinessException } from '../exception/business.exception';
import {
  ALLOWED_ACTOR_KEY,
  REQUIRE_ADMIN_LEVEL_KEY,
  REQUIRE_CAPABILITY_KEY,
  REQUIRE_RANK_KEY,
} from '../decorator/auth.decorator';
import { ADMIN_LEVEL, USER_RANK, JOB_LABEL, CAPABILITY, Principal } from '@ivy/types';

/**
 * Unit tests for the AuthorizationGuard. The Reflector is mocked to return
 * per-decorator metadata; a fake ExecutionContext supplies the request user.
 * Deny-by-default (FR-056).
 */

/** A Reflector whose getAllAndOverride returns the supplied metadata per key. */
function makeReflector(meta: Record<string, unknown>): Reflector {
  return {
    getAllAndOverride: jest.fn((key: string) => meta[key]),
  } as unknown as Reflector;
}

function makeContext(user: Principal | undefined): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

const adminSuper: Principal = {
  actorType: 'admin',
  adminId: 1,
  email: 'a@x.com',
  level: ADMIN_LEVEL.SUPER_ADMIN,
};

const adminPlain: Principal = {
  actorType: 'admin',
  adminId: 2,
  email: 'b@x.com',
  level: ADMIN_LEVEL.ADMIN,
};

const masterUser: Principal = {
  actorType: 'user',
  userId: 10,
  tenantId: 1,
  email: 'm@x.com',
  rank: USER_RANK.MASTER,
  labels: [],
};

const staffConsult: Principal = {
  actorType: 'user',
  userId: 11,
  tenantId: 1,
  email: 's@x.com',
  rank: USER_RANK.STAFF,
  labels: [JOB_LABEL.CONSULT],
};

function run(meta: Record<string, unknown>, user: Principal | undefined): boolean {
  const guard = new AuthorizationGuard(makeReflector(meta));
  return guard.canActivate(makeContext(user));
}

describe('AuthorizationGuard — authentication', () => {
  it('throws when no principal is present on the request', () => {
    expect(() => run({}, undefined)).toThrow(BusinessException);
  });

  it('allows an authenticated principal when no metadata constraints exist', () => {
    expect(run({}, masterUser)).toBe(true);
  });
});

describe('AuthorizationGuard — actor gating', () => {
  it('denies a tenant user on an admin-only route', () => {
    expect(() => run({ [ALLOWED_ACTOR_KEY]: ['admin'] }, masterUser)).toThrow(BusinessException);
  });

  it('denies an admin on a user-only route', () => {
    expect(() => run({ [ALLOWED_ACTOR_KEY]: ['user'] }, adminSuper)).toThrow(BusinessException);
  });
});

describe('AuthorizationGuard — admin level gating', () => {
  it('allows super_admin where super_admin is required', () => {
    expect(
      run({ [ALLOWED_ACTOR_KEY]: ['admin'], [REQUIRE_ADMIN_LEVEL_KEY]: [ADMIN_LEVEL.SUPER_ADMIN] }, adminSuper),
    ).toBe(true);
  });

  it('denies plain admin where super_admin is required', () => {
    expect(() =>
      run({ [ALLOWED_ACTOR_KEY]: ['admin'], [REQUIRE_ADMIN_LEVEL_KEY]: [ADMIN_LEVEL.SUPER_ADMIN] }, adminPlain),
    ).toThrow(BusinessException);
  });

  it('admin capability gate: allows super_admin for a granted cap', () => {
    expect(run({ [REQUIRE_CAPABILITY_KEY]: [CAPABILITY.TENANT_OFFBOARD] }, adminSuper)).toBe(true);
  });

  it('admin capability gate: denies plain admin for a super-admin-only cap (deny-by-default)', () => {
    expect(() => run({ [REQUIRE_CAPABILITY_KEY]: [CAPABILITY.TENANT_OFFBOARD] }, adminPlain)).toThrow(
      BusinessException,
    );
  });
});

describe('AuthorizationGuard — tenant-user rank & capability gating', () => {
  it('allows master where master rank is required', () => {
    expect(run({ [ALLOWED_ACTOR_KEY]: ['user'], [REQUIRE_RANK_KEY]: [USER_RANK.MASTER] }, masterUser)).toBe(
      true,
    );
  });

  it('denies staff where master rank is required', () => {
    expect(() =>
      run({ [ALLOWED_ACTOR_KEY]: ['user'], [REQUIRE_RANK_KEY]: [USER_RANK.MASTER] }, staffConsult),
    ).toThrow(BusinessException);
  });

  it('allows staff-with-consult for CONVERSATION_HANDLE (rank grant + matching label)', () => {
    expect(run({ [REQUIRE_CAPABILITY_KEY]: [CAPABILITY.CONVERSATION_HANDLE] }, staffConsult)).toBe(true);
  });

  it('denies staff-with-consult for CAMPAIGN_SEND (not in staff rank grant) — deny-by-default', () => {
    expect(() => run({ [REQUIRE_CAPABILITY_KEY]: [CAPABILITY.CAMPAIGN_SEND] }, staffConsult)).toThrow(
      BusinessException,
    );
  });

  it('denies staff for a label-gated module without the matching label', () => {
    expect(() => run({ [REQUIRE_CAPABILITY_KEY]: [CAPABILITY.MODULE_OPERATIONS] }, staffConsult)).toThrow(
      BusinessException,
    );
  });

  it('requires EVERY listed capability (denies if any one fails)', () => {
    expect(() =>
      run(
        { [REQUIRE_CAPABILITY_KEY]: [CAPABILITY.CONVERSATION_HANDLE, CAPABILITY.CAMPAIGN_SEND] },
        staffConsult,
      ),
    ).toThrow(BusinessException);
  });
});
