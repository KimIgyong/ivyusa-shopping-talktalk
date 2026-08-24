import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/Field';
import type { ClientPasswordRule } from './password-policy';

/** i18n keys for the live per-rule policy hints (shared by every change form). */
export const RULE_LABEL_KEY: Record<ClientPasswordRule, string> = {
  min_length: 'policyRuleMinLength',
  char_classes: 'policyRuleCharClasses',
  common_password: 'policyRuleCommon',
};

export const RULE_ORDER: ClientPasswordRule[] = ['min_length', 'char_classes', 'common_password'];

/** Password input with a show/hide (eye) toggle for entry confirmation. */
export function PasswordField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation('auth');
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
        aria-label={show ? t('hidePassword') : t('showPassword')}
        title={show ? t('hidePassword') : t('showPassword')}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
