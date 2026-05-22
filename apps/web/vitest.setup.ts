import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// jest-axe ships a Jest matcher; Vitest's `expect.extend` shape differs, so tests
// assert `violations` is empty explicitly.

beforeEach(() => {
  // jsdom lacks `matchMedia`; keep a minimal MediaQueryList stand-in for client effects.
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((_query: string): MediaQueryList => {
      return {
        matches: false,
        media: _query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    }),
  );

  // MOCK: jsdom lacks ResizeObserver; BasemapInner uses one to react to late
  // container layout. No-op stub is sufficient — production behavior is tested
  // in the browser, not jsdom.
  vi.stubGlobal(
    "ResizeObserver",
    vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
