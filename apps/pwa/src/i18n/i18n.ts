import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import es from './locales/es';
import ko from './locales/ko';
import vi from './locales/vi';
import ja from './locales/ja';
import zh from './locales/zh';
import { SUPPORTED_LANGUAGES, type AppLanguage } from '../lib/config';
import { getLangOverride } from '../lib/storage';

/** localStorage override → navigator.language prefix → 'en'. */
export function initialLanguage(): AppLanguage {
  const stored = getLangOverride();
  if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
    return stored as AppLanguage;
  }
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(nav) ? (nav as AppLanguage) : 'en';
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    ko: { translation: ko },
    vi: { translation: vi },
    ja: { translation: ja },
    zh: { translation: zh },
  },
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
