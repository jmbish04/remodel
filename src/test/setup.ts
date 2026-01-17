import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Cleanup after each test case (e.g., clearing jsdom)
afterEach(() => {
  cleanup();
});

// Mock fetch globally for tests
global.fetch = vi.fn();

// Mock crypto.randomUUID for consistent test IDs
if (typeof global.crypto === 'undefined') {
  global.crypto = {
    randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2, 11),
  } as Crypto;
}
