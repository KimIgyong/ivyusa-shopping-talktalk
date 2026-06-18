import { useNavigate } from 'react-router-dom';
import { PanelLeft, LogOut, KeyRound } from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { useUiStore } from '@/store/ui-store';
import { Badge } from '@/components/Badge';

export function Header({ onChangePassword }: { onChangePassword: () => void }) {
  const principal = useAuthStore((s) => s.principal);
  const clear = useAuthStore((s) => s.clear);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const navigate = useNavigate();

  const logout = () => {
    clear();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <button
        onClick={toggleSidebar}
        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
        aria-label="Toggle sidebar"
      >
        <PanelLeft className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-4">
        <div className="text-right leading-tight">
          <p className="text-sm font-medium text-gray-800">{principal?.email}</p>
          <div className="flex items-center justify-end gap-1">
            <Badge tone={principal?.actorType === 'admin' ? 'primary' : 'info'}>
              {principal?.actorType === 'admin' ? 'admin' : principal?.rank ?? 'user'}
            </Badge>
          </div>
        </div>
        <button
          onClick={onChangePassword}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          title="Change password"
        >
          <KeyRound className="h-5 w-5" />
        </button>
        <button
          onClick={logout}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          title="Log out"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
