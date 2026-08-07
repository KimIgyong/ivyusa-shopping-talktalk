import {
  LayoutDashboard,
  MessagesSquare,
  History,
  ClipboardList,
  BarChart3,
  Bot,
  BookOpen,
  Users,
  ShoppingCart,
  Megaphone,
  Star,
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
  { to: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard, capability: 'dashboard' },
  { to: '/live-chat', labelKey: 'liveChat', icon: MessagesSquare, capability: 'live_chat' },
  { to: '/history', labelKey: 'history', icon: History, capability: 'history' },
  // Audit-backed agent activity — same holders as TENANT_AUDIT_READ.
  { to: '/work-log', labelKey: 'workLog', icon: ClipboardList, capability: 'work_log' },
  { to: '/statistics', labelKey: 'statistics', icon: BarChart3, capability: 'statistics' },
  { to: '/ai-setting', labelKey: 'aiSettings', icon: Bot, capability: 'ai_settings' },
  { to: '/knowledge', labelKey: 'knowledge', icon: BookOpen, capability: 'knowledge' },
  { to: '/customers', labelKey: 'customers', icon: Users, capability: 'customers' },
  { to: '/orders', labelKey: 'orders', icon: ShoppingCart, capability: 'orders' },
  { to: '/campaigns', labelKey: 'campaigns', icon: Megaphone, capability: 'campaigns' },
  // Review moderation console (D3) — same operations group as the API's MODULE_OPERATIONS gate.
  { to: '/reviews', labelKey: 'reviews', icon: Star, capability: 'reviews' },
  { to: '/users', labelKey: 'users', icon: UserCog, capability: 'users' },
  { to: '/settings', labelKey: 'settings', icon: Settings, capability: 'settings' },
  // Consent notice config — same master/director gate as tenant settings.
  { to: '/privacy-notice', labelKey: 'privacyNotice', icon: ShieldCheck, capability: 'settings' },
];

export const ADMIN_NAV: NavItem[] = [
  { to: '/admin', labelKey: 'overview', icon: ShieldCheck },
  { to: '/admin/tenants', labelKey: 'tenants', icon: Building2 },
  { to: '/admin/ai-engines', labelKey: 'aiEngines', icon: Cpu },
  { to: '/admin/audit', labelKey: 'audit', icon: ScrollText },
];
