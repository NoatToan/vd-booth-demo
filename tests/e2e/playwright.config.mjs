// Playwright e2e for the booth: every screen against its Figma render, and every journey clicked through.
//   pnpm --dir tests/e2e test        then open tests/e2e/compare/index.html (before / after per screen)
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.mjs/,
  fullyParallel: true,
  workers: 4,
  timeout: 120_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  globalSetup: './global-setup.mjs',
  globalTeardown: './global-teardown.mjs',
  use: { baseURL: 'http://127.0.0.1:4320', channel: 'chrome', headless: true },
  webServer: { command: 'node serve.mjs', url: 'http://127.0.0.1:4320/index.html', reuseExistingServer: true },
});
