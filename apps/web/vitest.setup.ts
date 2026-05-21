import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jest-axe ships a Jest matcher; Vitest's `expect.extend` shape differs, so tests
// assert `violations` is empty explicitly.

afterEach(() => {
  cleanup();
});
