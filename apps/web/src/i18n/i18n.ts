import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// English
import enCommon from './locales/en/common.json';
import enNav from './locales/en/nav.json';
import enAuth from './locales/en/auth.json';
import enDashboard from './locales/en/dashboard.json';
import enLivechat from './locales/en/livechat.json';
import enHistory from './locales/en/history.json';
import enAiSetting from './locales/en/aiSetting.json';
import enKnowledge from './locales/en/knowledge.json';
import enCustomers from './locales/en/customers.json';
import enCampaigns from './locales/en/campaigns.json';
import enUsers from './locales/en/users.json';
import enSettings from './locales/en/settings.json';
import enTenants from './locales/en/tenants.json';
import enAiEngines from './locales/en/aiEngines.json';
import enAudit from './locales/en/audit.json';
import enOverview from './locales/en/overview.json';

// Spanish
import esCommon from './locales/es/common.json';
import esNav from './locales/es/nav.json';
import esAuth from './locales/es/auth.json';
import esDashboard from './locales/es/dashboard.json';
import esLivechat from './locales/es/livechat.json';
import esHistory from './locales/es/history.json';
import esAiSetting from './locales/es/aiSetting.json';
import esKnowledge from './locales/es/knowledge.json';
import esCustomers from './locales/es/customers.json';
import esCampaigns from './locales/es/campaigns.json';
import esUsers from './locales/es/users.json';
import esSettings from './locales/es/settings.json';
import esTenants from './locales/es/tenants.json';
import esAiEngines from './locales/es/aiEngines.json';
import esAudit from './locales/es/audit.json';
import esOverview from './locales/es/overview.json';

// Korean
import koCommon from './locales/ko/common.json';
import koNav from './locales/ko/nav.json';
import koAuth from './locales/ko/auth.json';
import koDashboard from './locales/ko/dashboard.json';
import koLivechat from './locales/ko/livechat.json';
import koHistory from './locales/ko/history.json';
import koAiSetting from './locales/ko/aiSetting.json';
import koKnowledge from './locales/ko/knowledge.json';
import koCustomers from './locales/ko/customers.json';
import koCampaigns from './locales/ko/campaigns.json';
import koUsers from './locales/ko/users.json';
import koSettings from './locales/ko/settings.json';
import koTenants from './locales/ko/tenants.json';
import koAiEngines from './locales/ko/aiEngines.json';
import koAudit from './locales/ko/audit.json';
import koOverview from './locales/ko/overview.json';

export const SUPPORTED_LANGUAGES = ['en', 'es', 'ko'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_STORAGE_KEY = 'ivy_lang';

export const ns = [
  'common',
  'nav',
  'auth',
  'dashboard',
  'livechat',
  'history',
  'aiSetting',
  'knowledge',
  'customers',
  'campaigns',
  'users',
  'settings',
  'tenants',
  'aiEngines',
  'audit',
  'overview',
] as const;

const resources = {
  en: {
    common: enCommon,
    nav: enNav,
    auth: enAuth,
    dashboard: enDashboard,
    livechat: enLivechat,
    history: enHistory,
    aiSetting: enAiSetting,
    knowledge: enKnowledge,
    customers: enCustomers,
    campaigns: enCampaigns,
    users: enUsers,
    settings: enSettings,
    tenants: enTenants,
    aiEngines: enAiEngines,
    audit: enAudit,
    overview: enOverview,
  },
  es: {
    common: esCommon,
    nav: esNav,
    auth: esAuth,
    dashboard: esDashboard,
    livechat: esLivechat,
    history: esHistory,
    aiSetting: esAiSetting,
    knowledge: esKnowledge,
    customers: esCustomers,
    campaigns: esCampaigns,
    users: esUsers,
    settings: esSettings,
    tenants: esTenants,
    aiEngines: esAiEngines,
    audit: esAudit,
    overview: esOverview,
  },
  ko: {
    common: koCommon,
    nav: koNav,
    auth: koAuth,
    dashboard: koDashboard,
    livechat: koLivechat,
    history: koHistory,
    aiSetting: koAiSetting,
    knowledge: koKnowledge,
    customers: koCustomers,
    campaigns: koCampaigns,
    users: koUsers,
    settings: koSettings,
    tenants: koTenants,
    aiEngines: koAiEngines,
    audit: koAudit,
    overview: koOverview,
  },
} as const;

function getInitialLanguage(): SupportedLanguage {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
      return stored as SupportedLanguage;
    }
  }
  return 'en';
}

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: ns as unknown as string[],
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
