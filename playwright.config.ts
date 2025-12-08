import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    // Use port 9000 for test server to avoid conflicts with dev server and other apps
    baseURL: 'http://localhost:9000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-real-auth',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
    },
    {
      name: 'setup-auth',
      testMatch: /setup-auth\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm run dev:test',
    url: 'http://localhost:9000',
    // Always start fresh server for tests to ensure TEST_MODE is enabled
    // Set REUSE_SERVER=1 to use existing server (must be started with TEST_MODE=true)
    reuseExistingServer: !!process.env.REUSE_SERVER,
    timeout: 120 * 1000,
  },
});
