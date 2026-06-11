import { defineConfig, devices } from "@playwright/test";

const MAP_MODE = process.env.NEXT_PUBLIC_SCOUT_MAP_MODE ?? "stub";
const GEOCODING = process.env.NEXT_PUBLIC_SCOUT_GEOCODING_PROVIDER ?? "stub";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
    locale: "en-US",
    extraHTTPHeaders: {
      Accept: "*/*",
    },
  },
  projects: [
    {
      name: "desktop",
      grepInvert: /@mobile/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile375",
      grep: /@mobile/,
      use: { viewport: { width: 375, height: 800 } },
    },
  ],
  webServer: {
    command: `NEXT_PUBLIC_SCOUT_MAP_MODE=${MAP_MODE} NEXT_PUBLIC_SCOUT_GEOCODING_PROVIDER=${GEOCODING} npm run dev -- --hostname 127.0.0.1 --port 3000`,
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
