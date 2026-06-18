import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' };

export function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/40" onClick={onClose} />
      <div className={`relative w-full ${sizes[size]} rounded-lg bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-800">{title}</h3>
          {onClose && (
            <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
