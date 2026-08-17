import { Bell, MessageCircle, Package } from 'lucide-react';
import type { TabKey } from '../../store/widgetStore';

/**
 * Everything both tab bars need to know about a tab, in one place
 * (PLN-260817-Widget-Tab-Config S3).
 *
 * The top bar renders labels only and the bottom bar renders icon + label, but
 * they must agree on which tabs exist, what they are called and which badge
 * count belongs to which — so the definitions do not live in either component.
 */
export interface TabDef {
  key: TabKey;
  labelKey: string;
  icon: typeof Bell;
}

const DEFS: Record<TabKey, TabDef> = {
  notifications: { key: 'notifications', labelKey: 'tab.notifications', icon: Bell },
  orders: { key: 'orders', labelKey: 'tab.orders', icon: Package },
  chat: { key: 'chat', labelKey: 'tab.chat', icon: MessageCircle },
};

/** Definitions for the tenant's visible tabs, in the order they were given. */
export function tabDefs(visible: TabKey[]): TabDef[] {
  return visible.map((k) => DEFS[k]).filter(Boolean);
}
