import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/* RTL não auto-limpa quando globals:false. Cleanup manual após cada teste
   pra não vazar nodes entre specs. */
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/* jsdom não implementa matchMedia — GSAP/animações que checkam isso
   precisam de stub pra não explodir no import time. */
if (typeof window !== 'undefined' && !window.matchMedia) {
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
}
