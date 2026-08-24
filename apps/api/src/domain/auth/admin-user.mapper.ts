import { AdminUser } from './entity/admin-user.entity';

/** Platform-admin row for the /admin/admins console (REQ-260824). */
export function toAdminUserResponse(a: AdminUser) {
  return {
    id: a.id,
    email: a.email,
    level: a.level,
    status: a.status,
    mustChangePassword: a.mustChangePassword === 1,
    createdAt: a.createdAt,
  };
}
