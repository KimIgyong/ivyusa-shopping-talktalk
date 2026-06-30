import { useState } from 'react';
import {
  Truck,
  RotateCcw,
  HelpCircle,
  Phone,
  Users,
  Package,
  ArrowLeft,
  Sparkles,
  Leaf,
  Bell,
  MessageSquare,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ScenarioButton } from '../../lib/types';

/** Product Help submenu actions (client-only, not server-driven). */
export type SubAction = 'usage' | 'ingredients' | 'exchange' | 'restock';

/** Icon per server action key, with a sensible fallback for custom buttons. */
const ACTION_ICONS: Record<string, React.ReactNode> = {
  delivery_status: <Truck className="h-4 w-4" />,
  cancel_refund: <RotateCcw className="h-4 w-4" />,
  product_help: <Sparkles className="h-4 w-4" />,
  contact_support: <Phone className="h-4 w-4" />,
  affiliate: <Users className="h-4 w-4" />,
  my_orders: <Package className="h-4 w-4" />,
  message: <MessageSquare className="h-4 w-4" />,
};

function MenuButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-800 transition-colors hover:border-primary-400 hover:bg-primary-500/5"
    >
      <span className="text-primary-500">{icon}</span>
      {label}
    </button>
  );
}

export function ScenarioMenu({
  buttons,
  onScenario,
  onSubAction,
}: {
  buttons: ScenarioButton[];
  /** Fired for a top-level config button (Product Help is handled internally). */
  onScenario: (button: ScenarioButton) => void;
  /** Fired for a Product Help submenu button. */
  onSubAction: (a: SubAction) => void;
}) {
  const { t } = useTranslation();
  const [sub, setSub] = useState(false);

  if (sub) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <MenuButton icon={<HelpCircle className="h-4 w-4" />} label={t('chat.productHelp.usage')} onClick={() => onSubAction('usage')} />
        <MenuButton icon={<Leaf className="h-4 w-4" />} label={t('chat.productHelp.ingredients')} onClick={() => onSubAction('ingredients')} />
        <MenuButton icon={<RotateCcw className="h-4 w-4" />} label={t('chat.productHelp.exchange')} onClick={() => onSubAction('exchange')} />
        <MenuButton icon={<Bell className="h-4 w-4" />} label={t('chat.productHelp.restock')} onClick={() => onSubAction('restock')} />
        <MenuButton icon={<ArrowLeft className="h-4 w-4" />} label={t('chat.productHelp.back')} onClick={() => setSub(false)} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {buttons.map((b) => (
        <MenuButton
          key={b.id}
          icon={ACTION_ICONS[b.action] ?? ACTION_ICONS.message}
          label={b.label}
          onClick={() => (b.action === 'product_help' ? setSub(true) : onScenario(b))}
        />
      ))}
    </div>
  );
}
