import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth-store';
import type { ActorType } from '@/lib/types';

interface Props {
  children: ReactNode;
  actorType?: ActorType;
}

export function ProtectedRoute({ children, actorType }: Props) {
  const principal = useAuthStore((s) => s.principal);
  const token = useAuthStore((s) => s.accessToken);
  const tenantSlug = useAuthStore((s) => s.tenantSlug);

  if (!token || !principal) {
    // Admin area → admin login; tenant area → the last-used tenant login page,
    // falling back to the landing page when we don't know the tenant.
    const target = actorType === 'admin' ? '/admin/login' : tenantSlug ? `/${tenantSlug}` : '/';
    return <Navigate to={target} replace />;
  }

  if (actorType && principal.actorType !== actorType) {
    // Send to the home that matches their actor type.
    return <Navigate to={principal.actorType === 'admin' ? '/admin' : '/dashboard'} replace />;
  }

  return <>{children}</>;
}
