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
} from 'lucide-react';
import { strings } from '../../i18n/strings';

export type ScenarioAction =
  | 'delivery'
  | 'cancelRefund'
  | 'productHelp'
  | 'contact'
  | 'affiliate'
  | 'myOrders'
  | 'usage'
  | 'ingredients'
  | 'exchange'
  | 'restock';

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
  onAction,
}: {
  onAction: (a: ScenarioAction) => void;
}) {
  const [sub, setSub] = useState(false);
  const s = strings.chat.scenarios;
  const p = strings.chat.productHelp;

  if (sub) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <MenuButton icon={<HelpCircle className="h-4 w-4" />} label={p.usage} onClick={() => onAction('usage')} />
        <MenuButton icon={<Leaf className="h-4 w-4" />} label={p.ingredients} onClick={() => onAction('ingredients')} />
        <MenuButton icon={<RotateCcw className="h-4 w-4" />} label={p.exchange} onClick={() => onAction('exchange')} />
        <MenuButton icon={<Bell className="h-4 w-4" />} label={p.restock} onClick={() => onAction('restock')} />
        <MenuButton icon={<ArrowLeft className="h-4 w-4" />} label={p.back} onClick={() => setSub(false)} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <MenuButton icon={<Truck className="h-4 w-4" />} label={s.delivery} onClick={() => onAction('delivery')} />
      <MenuButton icon={<RotateCcw className="h-4 w-4" />} label={s.cancelRefund} onClick={() => onAction('cancelRefund')} />
      <MenuButton icon={<Sparkles className="h-4 w-4" />} label={s.productHelp} onClick={() => setSub(true)} />
      <MenuButton icon={<Phone className="h-4 w-4" />} label={s.contact} onClick={() => onAction('contact')} />
      <MenuButton icon={<Users className="h-4 w-4" />} label={s.affiliate} onClick={() => onAction('affiliate')} />
      <MenuButton icon={<Package className="h-4 w-4" />} label={s.myOrders} onClick={() => onAction('myOrders')} />
    </div>
  );
}
