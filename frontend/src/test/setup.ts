import { vi } from 'vitest';
import '@testing-library/jest-dom';

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
