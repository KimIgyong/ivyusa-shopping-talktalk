import { NavLink } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { useUiStore } from '@/store/ui-store';
import { makeCan } from '@/lib/rbac';
import { TENANT_NAV, ADMIN_NAV, type NavItem } from './nav-config';
import { cn } from '@/lib/cn';

export function Sidebar() {
  const principal = useAuthStore((s) => s.principal);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const isAdmin = principal?.actorType === 'admin';

  let items: NavItem[];
  if (isAdmin) {
    items = ADMIN_NAV;
  } else {
    const can = makeCan(principal);
    items = TENANT_NAV.filter((i) => !i.capability || can(i.capability));
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-30 flex h-full flex-col border-r border-gray-200 bg-white transition-[width] duration-200',
        collapsed ? 'w-[64px]' : 'w-[240px]',
      )}
    >
      <div className="flex h-16 items-center gap-2 border-b border-gray-100 px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-500 text-white">
          <Sparkles className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <p className="text-sm font-semibold text-gray-900">IVY TalkTalk</p>
            <p className="text-xs text-gray-400">{isAdmin ? 'Platform Admin' : 'Console'}</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/' || item.to === '/admin'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-500/10 text-primary-600'
                    : 'text-gray-600 hover:bg-gray-100',
                  collapsed && 'justify-center px-0',
                )
              }
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
