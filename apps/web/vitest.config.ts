import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts",
    include: ["**/*.test.tsx", "**/*.test.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      include: ["components/**/*.{tsx,ts}", "lib/**/*.{tsx,ts}"],
      exclude: [
        "**/*.test.*",
        "**/node_modules/**",
        ".next/**",
        "components/BasemapInner.tsx",
      ],
      /**
       * Line/function thresholds match scaffold expectations from apps/web/AGENTS.md.
       * Branch percentages are inflated by Radix/RAC internals; reviewers rely on the HTML report instead.
       */
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
});
