import { defineConfig, devices } from '@playwright/test'
import './playwright/env'

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const webServerCommand = process.env.E2E_PRODUCTION_SERVER
  ? 'pnpm exec wrangler dev --local --config dist/server/wrangler.json --port 3000'
  : 'pnpm dev'

export default defineConfig({
  testDir: './playwright',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html'], ['github']] : [['list'], ['html']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: webServerCommand,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'chromium-public',
      testMatch: /.*\.public\.spec\.ts/,
      use: devices['Desktop Chrome'],
    },
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium-authenticated',
      dependencies: ['setup'],
      testMatch: /.*\.authenticated\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.clerk/user.json',
      },
    },
  ],
})
