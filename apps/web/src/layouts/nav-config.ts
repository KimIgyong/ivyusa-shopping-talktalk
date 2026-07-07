import {
  LayoutDashboard,
  MessagesSquare,
  History,
  Bot,
  BookOpen,
  Users,
  ShoppingCart,
  Megaphone,
  UserCog,
  Settings,
  Building2,
  Cpu,
  ScrollText,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import type { Capability } from '@/lib/rbac';

export interface NavItem {
  to: string;
  labelKey: string; // i18n key in the `nav` namespace
  icon: LucideIcon;
  capability?: Capability; // tenant-side gating; admin items use actorType check
}

export const TENANT_NAV: NavItem[] = [
  { to: '/', labelKey: 'dashboard', icon: LayoutDashboard, capability: 'dashboard' },
  { to: '/live-chat', labelKey: 'liveChat', icon: MessagesSquare, capability: 'live_chat' },
  { to: '/history', labelKey: 'history', icon: History, capability: 'history' },
  { to: '/ai-setting', labelKey: 'aiSettings', icon: Bot, capability: 'ai_settings' },
  { to: '/knowledge', labelKey: 'knowledge', icon: BookOpen, capability: 'knowledge' },
  { to: '/customers', labelKey: 'customers', icon: Users, capability: 'customers' },
  { to: '/orders', labelKey: 'orders', icon: ShoppingCart, capability: 'orders' },
  { to: '/campaigns', labelKey: 'campaigns', icon: Megaphone, capability: 'campaigns' },
  { to: '/users', labelKey: 'users', icon: UserCog, capability: 'users' },
  { to: '/settings', labelKey: 'settings', icon: Settings, capability: 'settings' },
];

export const ADMIN_NAV: NavItem[] = [
  { to: '/admin', labelKey: 'overview', icon: ShieldCheck },
  { to: '/admin/tenants', labelKey: 'tenants', icon: Building2 },
  { to: '/admin/ai-engines', labelKey: 'aiEngines', icon: Cpu },
  { to: '/admin/audit', labelKey: 'audit', icon: ScrollText },
];
