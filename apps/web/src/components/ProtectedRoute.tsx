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

  if (!token || !principal) {
    return <Navigate to="/login" replace />;
  }

  if (actorType && principal.actorType !== actorType) {
    // Send to the home that matches their actor type.
    return <Navigate to={principal.actorType === 'admin' ? '/admin' : '/'} replace />;
  }

  return <>{children}</>;
}
