import * as bcrypt from 'bcryptjs';
import { PasswordRecoveryService } from './password-recovery.service';
import { BusinessException } from '../../global/exception/business.exception';

const IP = '203.0.113.5';

function makeService(over: {
  tenant?: object | null;
  user?: Record<string, unknown> | null;
  mailerConfigured?: boolean;
  mailSendOk?: boolean;
  quotaExceeded?: boolean;
}) {
  const tenant =
    over.tenant === undefined ? { id: 1, slug: 'ivyusa', status: 'active' } : over.tenant;
  const user = over.user === undefined ? null : over.user;
  const userRepo = {
    findOne: jest.fn(async () => user),
    save: jest.fn(async () => user),
  };
  const tenantRepo = { findOne: jest.fn(async () => tenant) };
  const loginLimiter = {
    assertQuota: jest.fn(async () => {
      if (over.quotaExceeded) throw new BusinessException({ code: 'E1013', message: 'x' }, 429);
    }),
    bumpQuota: jest.fn(async () => undefined),
    recordFailure: jest.fn(async () => undefined),
    clearAccountLock: jest.fn(async () => undefined),
  };
  const mailer = {
    configured: jest.fn(() => over.mailerConfigured !== false),
    send: jest.fn(async () => over.mailSendOk !== false),
  };
  const audit = { write: jest.fn(async () => undefined) };
  const config = { get: jest.fn(() => undefined) };
  const service = new PasswordRecoveryService(
    userRepo as never,
    tenantRepo as never,
    loginLimiter as never,
    mailer as never,
    audit as never,
    config as never,
  );
  return { service, userRepo, tenantRepo, loginLimiter, mailer, audit };
}

describe('PasswordRecoveryService.requestTempPassword', () => {
  it('returns the same neutral response whether or not the account exists', async () => {
    const missing = makeService({ user: null });
    const hit = makeService({
      user: { id: 7, tenantId: 1, email: 'a@x.com', status: 'active', passwordHash: 'h' },
    });
    await expect(missing.service.requestTempPassword('ivyusa', 'a@x.com', IP)).resolves.toEqual({
      requested: true,
    });
    await expect(hit.service.requestTempPassword('ivyusa', 'a@x.com', IP)).resolves.toEqual({
      requested: true,
    });
    // Both requests consumed quota — existence must not change the counting either.
    expect(missing.loginLimiter.bumpQuota).toHaveBeenCalled();
    expect(hit.loginLimiter.bumpQuota).toHaveBeenCalled();
  });

  it('issues + mails + unlocks for an existing account', async () => {
    const user: Record<string, unknown> = {
      id: 7,
      tenantId: 1,
      email: 'a@x.com',
      status: 'active',
      passwordHash: 'old',
      mustChangePassword: 0,
    };
    const { service, loginLimiter, mailer, audit, userRepo } = makeService({ user });

    await service.requestTempPassword('ivyusa', 'a@x.com', IP);

    expect(userRepo.save).toHaveBeenCalled();
    expect(user.mustChangePassword).toBe(1);
    expect(user.passwordHash).not.toBe('old');
    expect(loginLimiter.clearAccountLock).toHaveBeenCalledWith('user', 'a@x.com');
    expect(mailer.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@x.com' }));
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.temp_password_requested' }),
    );
  });

  it('stays neutral when the mail send itself fails', async () => {
    const { service } = makeService({
      user: { id: 7, tenantId: 1, email: 'a@x.com', status: 'active', passwordHash: 'h' },
      mailSendOk: false,
    });
    await expect(service.requestTempPassword('ivyusa', 'a@x.com', IP)).resolves.toEqual({
      requested: true,
    });
  });

  it('rejects with E1014 when no SMTP is configured (before any lookup)', async () => {
    const { service, userRepo } = makeService({ mailerConfigured: false });
    await expect(service.requestTempPassword('ivyusa', 'a@x.com', IP)).rejects.toMatchObject({
      errorCode: 'E1014',
    });
    expect(userRepo.findOne).not.toHaveBeenCalled();
  });

  it('propagates the quota rejection and does not issue anything', async () => {
    const { service, userRepo } = makeService({
      user: { id: 7, tenantId: 1, email: 'a@x.com', status: 'active', passwordHash: 'h' },
      quotaExceeded: true,
    });
    await expect(service.requestTempPassword('ivyusa', 'a@x.com', IP)).rejects.toBeInstanceOf(
      BusinessException,
    );
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('treats a suspended user/tenant as non-existent (still neutral)', async () => {
    const { service, userRepo } = makeService({
      user: { id: 7, tenantId: 1, email: 'a@x.com', status: 'suspended', passwordHash: 'h' },
    });
    await expect(service.requestTempPassword('ivyusa', 'a@x.com', IP)).resolves.toEqual({
      requested: true,
    });
    expect(userRepo.save).not.toHaveBeenCalled();
  });
});

describe('PasswordRecoveryService.changePassword', () => {
  const NEW_PW = 'Str0ng!Passw0rd#42';

  async function activeUser(currentPw = 'OldPass9!x') {
    return {
      id: 7,
      tenantId: 1,
      email: 'a@x.com',
      name: null,
      status: 'active',
      passwordHash: await bcrypt.hash(currentPw, 4),
      mustChangePassword: 1,
      passwordChangedAt: null,
    } as Record<string, unknown>;
  }

  it('changes the password, clears the lock and stamps passwordChangedAt', async () => {
    const user = await activeUser();
    const { service, loginLimiter, audit, userRepo } = makeService({ user });

    await expect(
      service.changePassword('ivyusa', 'a@x.com', 'OldPass9!x', NEW_PW, IP),
    ).resolves.toEqual({ changed: true });

    expect(user.mustChangePassword).toBe(0);
    expect(user.passwordChangedAt).toBeInstanceOf(Date);
    expect(await bcrypt.compare(NEW_PW, user.passwordHash as string)).toBe(true);
    expect(userRepo.save).toHaveBeenCalled();
    expect(loginLimiter.clearAccountLock).toHaveBeenCalledWith('user', 'a@x.com');
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.password_changed_self' }),
    );
  });

  it('spends BOTH budgets on a wrong current password', async () => {
    const user = await activeUser();
    const { service, loginLimiter } = makeService({ user });

    await expect(
      service.changePassword('ivyusa', 'a@x.com', 'wrong-guess1', NEW_PW, IP),
    ).rejects.toMatchObject({ errorCode: 'E1002' });

    expect(loginLimiter.bumpQuota).toHaveBeenCalledWith('pwchange', 'a@x.com', IP, 3600);
    expect(loginLimiter.recordFailure).toHaveBeenCalledWith('user', 'a@x.com', IP);
  });

  it('behaves like a wrong password for a missing account (no enumeration)', async () => {
    const { service } = makeService({ user: null });
    await expect(
      service.changePassword('ivyusa', 'a@x.com', 'whatever99!', NEW_PW, IP),
    ).rejects.toMatchObject({ errorCode: 'E1002' });
  });

  it('rejects a policy-violating new password with E1009 (same as current)', async () => {
    const user = await activeUser();
    const { service, userRepo } = makeService({ user });
    await expect(
      // Reusing the current password passes the DTO's context-free rules but
      // fails the service's full-context re-validation (same_as_current).
      service.changePassword('ivyusa', 'a@x.com', 'OldPass9!x', 'OldPass9!x', IP),
    ).rejects.toMatchObject({ errorCode: 'E1009' });
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('is blocked by its own quota before any credential check', async () => {
    const user = await activeUser();
    const { service, userRepo } = makeService({ user, quotaExceeded: true });
    await expect(
      service.changePassword('ivyusa', 'a@x.com', 'OldPass9!x', NEW_PW, IP),
    ).rejects.toBeInstanceOf(BusinessException);
    expect(userRepo.findOne).not.toHaveBeenCalled();
  });
});
