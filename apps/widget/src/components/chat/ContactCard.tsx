import { Phone, Mail, Clock, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function ContactCard({ onChatAgent }: { onChatAgent: () => void }) {
  const { t } = useTranslation();
  const phone = t('contact.phone');
  const email = t('contact.email');
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-3 text-sm font-semibold text-gray-800">
        {t('contact.title')}
      </div>
      <div className="space-y-2 text-sm text-gray-700">
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-primary-500" />
          <a href={`tel:${phone}`} className="font-medium">
            {phone}
          </a>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Clock className="h-4 w-4 text-gray-400" />
          {t('contact.hours')}
        </div>
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary-500" />
          <a href={`mailto:${email}`} className="font-medium">
            {email}
          </a>
        </div>
      </div>
      <button
        onClick={onChatAgent}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600"
      >
        <MessageSquare className="h-4 w-4" />
        {t('contact.chatAgent')}
      </button>
    </div>
  );
}
