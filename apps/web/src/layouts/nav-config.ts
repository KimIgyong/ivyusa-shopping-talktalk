import {
  LayoutDashboard,
  MessagesSquare,
  History,
  Bot,
  BookOpen,
  Users,
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
  label: string;
  icon: LucideIcon;
  capability?: Capability; // tenant-side gating; admin items use actorType check
}

export const TENANT_NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, capability: 'dashboard' },
  { to: '/live-chat', label: 'Live Chat', icon: MessagesSquare, capability: 'live_chat' },
  { to: '/history', label: 'Conversation History', icon: History, capability: 'history' },
  { to: '/ai-setting', label: 'AI Settings', icon: Bot, capability: 'ai_settings' },
  { to: '/knowledge', label: 'Knowledge', icon: BookOpen, capability: 'knowledge' },
  { to: '/customers', label: 'Customers', icon: Users, capability: 'customers' },
  { to: '/campaigns', label: 'Campaigns', icon: Megaphone, capability: 'campaigns' },
  { to: '/users', label: 'Users & Labels', icon: UserCog, capability: 'users' },
  { to: '/settings', label: 'Tenant Settings', icon: Settings, capability: 'settings' },
];

export const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Overview', icon: ShieldCheck },
  { to: '/admin/tenants', label: 'Tenants', icon: Building2 },
  { to: '/admin/ai-engines', label: 'AI Engines', icon: Cpu },
  { to: '/admin/audit', label: 'Audit Log', icon: ScrollText },
];
