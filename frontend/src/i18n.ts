import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';
import enVault from './locales/en/vault.json';
import enAdmin from './locales/en/admin.json';

import deCommon from './locales/de/common.json';
import deAuth from './locales/de/auth.json';
import deVault from './locales/de/vault.json';
import deAdmin from './locales/de/admin.json';

import frCommon from './locales/fr/common.json';
import frAuth from './locales/fr/auth.json';
import frVault from './locales/fr/vault.json';
import frAdmin from './locales/fr/admin.json';

import ruCommon from './locales/ru/common.json';
import ruAuth from './locales/ru/auth.json';
import ruVault from './locales/ru/vault.json';
import ruAdmin from './locales/ru/admin.json';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon, auth: enAuth, vault: enVault, admin: enAdmin },
      de: { common: deCommon, auth: deAuth, vault: deVault, admin: deAdmin },
      fr: { common: frCommon, auth: frAuth, vault: frVault, admin: frAdmin },
      ru: { common: ruCommon, auth: ruAuth, vault: ruVault, admin: ruAdmin },
    },
    fallbackLng: 'en',
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'pv_language',
    },
  });

export default i18n;
