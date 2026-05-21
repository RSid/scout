import { defineConfig, devices } from "@playwright/test";

const MAP_MODE = process.env.NEXT_PUBLIC_SCOUT_MAP_MODE ?? "stub";
const GEO_STUB = process.env.NEXT_PUBLIC_SCOUT_STUB_GEOCODE ?? "1";

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
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile375",
      use: { viewport: { width: 375, height: 800 } },
    },
  ],
  webServer: {
    command: `NEXT_PUBLIC_SCOUT_MAP_MODE=${MAP_MODE} NEXT_PUBLIC_SCOUT_STUB_GEOCODE=${GEO_STUB} npm run dev -- --hostname 127.0.0.1 --port 3000`,
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
