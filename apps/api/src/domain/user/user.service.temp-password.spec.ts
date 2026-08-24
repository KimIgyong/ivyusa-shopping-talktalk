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
    const service = new UserService(
      userRepo as never,
      {} as never,
      {} as never,
      {} as never,
      audit as never,
      loginLimiter as never,
    );

    const result = await service.issueTempPassword(1, 7, 3);

    expect(result).toMatchObject({ userId: 7, email: 'locked@example.com' });
    expect(result.tempPassword).not.toBe('');
    expect(user.mustChangePassword).toBe(1);
    expect(loginLimiter.clearAccountLock).toHaveBeenCalledWith('user', 'locked@example.com');
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.temp_password_issued', actorId: 3 }),
    );
  });
});
