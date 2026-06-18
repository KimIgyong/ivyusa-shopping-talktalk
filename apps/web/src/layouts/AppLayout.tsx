import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useUiStore } from '@/store/ui-store';
import { useAuthStore } from '@/store/auth-store';
import { ChangePasswordModal } from '@/domain/auth/ChangePasswordModal';
import { cn } from '@/lib/cn';

export function AppLayout() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const mustChange = useAuthStore((s) => s.mustChangePassword);
  const [pwOpen, setPwOpen] = useState(false);

  return (
    <div className="min-h-full">
      <Sidebar />
      <div className={cn('transition-[margin] duration-200', collapsed ? 'ml-[64px]' : 'ml-[240px]')}>
        <Header onChangePassword={() => setPwOpen(true)} />
        <main className="mx-auto max-w-content p-6">
          <Outlet />
        </main>
      </div>
      <ChangePasswordModal
        open={pwOpen || mustChange}
        forced={mustChange}
        onClose={() => setPwOpen(false)}
      />
    </div>
  );
}
