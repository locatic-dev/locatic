import { defineConfig, devices } from '@playwright/test'

// No .env.local, Clerk, Convex deployment, personas or real member writes.
export default defineConfig({
  testDir: './playwright/components',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  use: { baseURL: 'http://127.0.0.1:3004', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm exec vite --config playwright/fixtures/ui/vite.config.ts',
    url: 'http://127.0.0.1:3004',
    reuseExistingServer: false,
  },
  projects: [{ name: 'chromium-components', use: devices['Desktop Chrome'] }],
})
