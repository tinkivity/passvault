import { vi } from 'vitest';
import '@testing-library/jest-dom';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enCommon from '../locales/en/common.json';
import enAuth from '../locales/en/auth.json';
import enVault from '../locales/en/vault.json';
import enAdmin from '../locales/en/admin.json';

// Initialize i18n for tests WITHOUT LanguageDetector (avoids --localstorage-file warnings in jsdom)
void i18n.use(initReactI18next).init({
  resources: { en: { common: enCommon, auth: enAuth, vault: enVault, admin: enAdmin } },
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
});

// Mock navigator.clipboard (not implemented in jsdom)
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  configurable: true,
  writable: true,
});

// Mock ResizeObserver (not implemented in jsdom)
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock scrollIntoView (not implemented in jsdom, used by cmdk)
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// Suppress recharts "width/height of chart should be greater than 0" warning —
// jsdom has no layout engine so container dimensions are always 0.
const originalWarn = console.warn.bind(console);
vi.stubGlobal('console', {
  ...console,
  warn: (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('width(0) and height(0) of chart')) return;
    originalWarn(...args);
  },
});

// Mock window.matchMedia (not implemented in jsdom, used by shadcn Sidebar)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
