import { defineConfig, devices } from "@playwright/test";

/**
 * Level 4 (R13): a real browser, three viewports, driven against the local
 * preview build. The deployed URL is used when PLAYWRIGHT_BASE_URL is set, so the
 * same suite runs unchanged once R9 lands.
 *
 * The system Edge channel is used deliberately: downloading Playwright's bundled
 * Chromium fails on this machine, and the point of the level is a real engine,
 * not a particular brand of it.
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    channel: "msedge",
    trace: "off",
    screenshot: "off",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "pnpm preview --port 4173 --host 127.0.0.1",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], channel: "msedge", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "tablet",
      use: { ...devices["Desktop Chrome"], channel: "msedge", viewport: { width: 768, height: 1024 } },
    },
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], channel: "msedge", viewport: { width: 390, height: 844 } },
    },
  ],
});
