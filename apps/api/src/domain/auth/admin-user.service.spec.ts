import * as bcrypt from 'bcryptjs';
import { AdminUserService } from './admin-user.service';
import { AdminUser } from './entity/admin-user.entity';
import { validatePassword } from '../../global/util/password-policy.util';

/**
 * Platform-admin invite/manage (REQ-260824-Admin-Account-Invite): duplicate
 * guard, credential hygiene, lock-recovery hook, the self/last-super-admin
 * deactivation guards, and the /admin/login mail link.
 */
describe('AdminUserService', () => {
  function build(rows: Partial<AdminUser>[] = []) {
    const saved: AdminUser[] = [];
    const adminRepo = {
      find: jest.fn(async () => rows as AdminUser[]),
      findOne: jest.fn(async (q: { where: Record<string, unknown> }) => {
        if (q.where.email != null) {
          return (rows.find((r) => r.email === q.where.email) ?? null) as AdminUser | null;
        }
        return (rows.find((r) => Number(r.id) === Number(q.where.id)) ?? null) as AdminUser | null;
      }),
      count: jest.fn(async (q: { where: Record<string, unknown> }) =>
        rows.filter(
          (r) =>
            r.level === q.where.level &&
            r.status === q.where.status &&
            // Not(admin.id) — the fake only needs "everyone but the target".
            Number(r.id) !== Number((q.where.id as { value: number }).value),
        ).length,
      ),
      create: jest.fn((v: Partial<AdminUser>) => v as AdminUser),
      save: jest.fn(async (v: AdminUser) => {
        saved.push(v);
        return { ...v, id: v.id ?? 99 };
      }),
    };
    const loginLimiter = { clearAccountLock: jest.fn() };
    const audits: Array<Record<string, unknown>> = [];
    const audit = { write: jest.fn(async (e: Record<string, unknown>) => audits.push(e)) };
    const mails: Array<{ to: string; text: string }> = [];
    const mailer = {
      configured: jest.fn(() => true),
      send: jest.fn(async (m: { to: string; text: string }) => {
        mails.push(m);
        return true;
      }),
    };
    const config = { get: jest.fn(() => 'https://shoptalk.example') };

    const svc = new AdminUserService(
      adminRepo as never,
      loginLimiter as never,
      audit as never,
      mailer as never,
      config as never,
    );
    return { svc, adminRepo, loginLimiter, audits, mails, mailer, saved };
  }

  it('refuses inviting an email that already has an admin account', async () => {
    const h = build([{ id: 1, email: 'admin@amoeba.group' }]);

    await expect(h.svc.invite(1, 'Admin@Amoeba.Group', 'admin')).rejects.toMatchObject({
      errorCode: 'E2002',
    });
    expect(h.adminRepo.save).not.toHaveBeenCalled();
  });

  it('creates an active account with a policy-clean temp password and a forced change', async () => {
    const h = build();

    const result = await h.svc.invite(1, ' Ops@Amoeba.Group ', 'admin');

    const row = h.saved[0];
    expect(row).toMatchObject({ email: 'ops@amoeba.group', level: 'admin', status: 'active', mustChangePassword: 1 });
    // The plaintext is never stored; the hash must verify against it.
    expect(row.passwordHash).not.toBe(result.tempPassword);
    expect(await bcrypt.compare(result.tempPassword, row.passwordHash as string)).toBe(true);
    // A temp password that fails the policy would bounce the very first login.
    expect(validatePassword(result.tempPassword)).toMatchObject({ ok: true, failed: [] });
    expect(h.audits[0]).toMatchObject({ tenantId: null, action: 'admin.invited' });
    expect(JSON.stringify(h.audits[0])).not.toContain(result.tempPassword);
  });

  it('mails the temp password with the /admin/login link, never a tenant path', async () => {
    const h = build();

    const result = await h.svc.invite(1, 'ops@amoeba.group', 'super_admin', true);

    expect(result.emailSent).toBe(true);
    expect(h.mails[0].to).toBe('ops@amoeba.group');
    expect(h.mails[0].text).toContain('https://shoptalk.example/admin/login');
    expect(h.mails[0].text).not.toContain('/user/');
  });

  it('temp-password reissue forces a change and clears the account lock', async () => {
    const h = build([{ id: 5, email: 'ops@amoeba.group', status: 'active', level: 'admin' }]);

    const result = await h.svc.issueTempPassword(1, 5, false);

    expect(h.saved[0].mustChangePassword).toBe(1);
    expect(h.loginLimiter.clearAccountLock).toHaveBeenCalledWith('admin', 'ops@amoeba.group');
    expect(result.tempPassword).toBeTruthy();
  });

  it('refuses deactivating yourself', async () => {
    const h = build([{ id: 1, email: 'admin@amoeba.group', level: 'super_admin', status: 'active' }]);

    await expect(h.svc.setStatus(1, 1, 'suspended')).rejects.toThrow();
    expect(h.adminRepo.save).not.toHaveBeenCalled();
  });

  it('refuses deactivating the last active super admin (E2004)', async () => {
    const h = build([
      { id: 1, email: 'admin@amoeba.group', level: 'super_admin', status: 'active' },
      { id: 2, email: 'ops@amoeba.group', level: 'admin', status: 'active' },
    ]);

    await expect(h.svc.setStatus(2, 1, 'suspended')).rejects.toMatchObject({ errorCode: 'E2004' });
  });

  it('deactivates a super admin when another active one remains', async () => {
    const h = build([
      { id: 1, email: 'admin@amoeba.group', level: 'super_admin', status: 'active' },
      { id: 2, email: 'ops@amoeba.group', level: 'super_admin', status: 'active' },
    ]);

    const updated = await h.svc.setStatus(2, 1, 'suspended');

    expect(updated.status).toBe('suspended');
    expect(h.audits[0]).toMatchObject({ action: 'admin.status_changed' });
  });
});
