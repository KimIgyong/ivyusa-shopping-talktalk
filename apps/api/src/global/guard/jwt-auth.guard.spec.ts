import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../decorator/public.decorator';
import { ALLOW_PENDING_PASSWORD_KEY } from '../decorator/allow-pending-password.decorator';
import { BusinessException } from '../exception/business.exception';

const SECRET = 'access-secret';

describe('JwtAuthGuard — must-change-password lockout (SEC-M2)', () => {
  const jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: 900 } });
  const config = { get: () => SECRET } as unknown as ConfigService;

  const ctxWith = (token: string | null, meta: Record<string, boolean>) => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => meta[key] ?? false),
    } as unknown as Reflector;
    const req: { headers: Record<string, string>; user?: unknown } = {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    };
    const ctx = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    return { guard: new JwtAuthGuard(reflector, jwt, config), ctx, req };
  };

  const principal = { actorType: 'admin', adminId: 1, email: 'a@x.com', level: 'admin' };

  it('blocks a pwd-pending token on a normal route with 403', async () => {
    const token = jwt.sign({ ...principal, pwdPending: true });
    const { guard, ctx } = ctxWith(token, {});
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      getStatus: expect.any(Function),
    });
    await guard.canActivate(ctx).catch((e: BusinessException) => {
      expect(e.getStatus()).toBe(HttpStatus.FORBIDDEN);
    });
  });

  it('allows a pwd-pending token on an @AllowPendingPassword route', async () => {
    const token = jwt.sign({ ...principal, pwdPending: true });
    const { guard, ctx, req } = ctxWith(token, { [ALLOW_PENDING_PASSWORD_KEY]: true });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toMatchObject({ adminId: 1 });
  });

  it('passes a normal token through untouched', async () => {
    const token = jwt.sign(principal);
    const { guard, ctx, req } = ctxWith(token, {});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toMatchObject({ actorType: 'admin' });
  });

  it('still honors @Public()', async () => {
    const { guard, ctx } = ctxWith(null, { [IS_PUBLIC_KEY]: true });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects a missing token with 401', async () => {
    const { guard, ctx } = ctxWith(null, {});
    await guard.canActivate(ctx).then(
      () => fail('should have thrown'),
      (e: BusinessException) => expect(e.getStatus()).toBe(HttpStatus.UNAUTHORIZED),
    );
  });
});
