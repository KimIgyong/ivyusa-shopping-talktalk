import { UserService } from './user.service';

describe('UserService.issueTempPassword', () => {
  it('clears only the target account lock after issuing a temporary password', async () => {
    const user = {
      id: 7,
      tenantId: 1,
      email: 'locked@example.com',
      passwordHash: 'old-hash',
      mustChangePassword: 0,
    };
    const userRepo = {
      findOne: jest.fn(async () => user),
      save: jest.fn(async () => user),
    };
    const audit = { write: jest.fn(async () => undefined) };
    const loginLimiter = { clearAccountLock: jest.fn(async () => undefined) };
    const mailer = { configured: jest.fn(() => true), send: jest.fn(async () => true) };
    const tenantService = { findById: jest.fn(async () => ({ id: 1, slug: 'ivyusa' })) };
    const config = { get: jest.fn(() => undefined) };
    const service = new UserService(
      userRepo as never,
      {} as never,
      {} as never,
      {} as never,
      audit as never,
      loginLimiter as never,
      mailer as never,
      tenantService as never,
      config as never,
    );

    const result = await service.issueTempPassword(1, 7, 3);

    expect(result).toMatchObject({ userId: 7, email: 'locked@example.com' });
    expect(result.tempPassword).not.toBe('');
    expect(user.mustChangePassword).toBe(1);
    expect(loginLimiter.clearAccountLock).toHaveBeenCalledWith('user', 'locked@example.com');
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.temp_password_issued', actorId: 3 }),
    );
    // Default (no opts): manual hand-off only — no mail attempted, no emailSent field.
    expect(mailer.send).not.toHaveBeenCalled();
    expect(result.emailSent).toBeUndefined();
  });

  it('emails the temp password when requested and reports delivery', async () => {
    const user = {
      id: 7,
      tenantId: 1,
      email: 'locked@example.com',
      passwordHash: 'old-hash',
      mustChangePassword: 0,
    };
    const userRepo = { findOne: jest.fn(async () => user), save: jest.fn(async () => user) };
    const audit = { write: jest.fn(async () => undefined) };
    const loginLimiter = { clearAccountLock: jest.fn(async () => undefined) };
    const mailer = { configured: jest.fn(() => true), send: jest.fn(async () => true) };
    const tenantService = { findById: jest.fn(async () => ({ id: 1, slug: 'ivyusa' })) };
    const config = { get: jest.fn(() => 'https://shoptalk.example') };
    const service = new UserService(
      userRepo as never,
      {} as never,
      {} as never,
      {} as never,
      audit as never,
      loginLimiter as never,
      mailer as never,
      tenantService as never,
      config as never,
    );

    const result = await service.issueTempPassword(1, 7, 3, 'user', { sendEmail: true });

    expect(result.emailSent).toBe(true);
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'locked@example.com' }),
    );
    const mail = mailer.send.mock.calls[0][0] as { text: string };
    // The mail links the NEW /user/<slug> login path and carries the password.
    expect(mail.text).toContain('/user/ivyusa');
    expect(mail.text).toContain(result.tempPassword);
    // Plaintext still returned — the admin can fall back to manual hand-off.
    expect(result.tempPassword).not.toBe('');
  });

  it('reports emailSent=false when the mailer is unconfigured (manual fallback)', async () => {
    const user = {
      id: 7,
      tenantId: 1,
      email: 'locked@example.com',
      passwordHash: 'old-hash',
      mustChangePassword: 0,
    };
    const userRepo = { findOne: jest.fn(async () => user), save: jest.fn(async () => user) };
    const mailer = { configured: jest.fn(() => false), send: jest.fn(async () => true) };
    const service = new UserService(
      userRepo as never,
      {} as never,
      {} as never,
      {} as never,
      { write: jest.fn(async () => undefined) } as never,
      { clearAccountLock: jest.fn(async () => undefined) } as never,
      mailer as never,
      { findById: jest.fn() } as never,
      { get: jest.fn() } as never,
    );

    const result = await service.issueTempPassword(1, 7, 3, 'user', { sendEmail: true });

    expect(result.emailSent).toBe(false);
    expect(mailer.send).not.toHaveBeenCalled();
    expect(result.tempPassword).not.toBe('');
  });
});
