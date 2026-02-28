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
