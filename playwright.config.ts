import { defineConfig, devices } from '@playwright/test'
import './playwright/env'

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const webServerCommand = process.env.E2E_PRODUCTION_SERVER
  ? 'pnpm exec wrangler dev --local --config dist/server/wrangler.json --port 3000'
  : 'pnpm dev'

export default defineConfig({
  testDir: './playwright',
  fullyParallel: true,
  // `pnpm dev` compiles each route on its first visit, which can take most of
  // the 30s default under a parallel run; specs wait up to 30s for a route to
  // settle (playwright/fixtures/test.ts).
  timeout: 60_000,
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
      name: 'preflight',
      testMatch: /preflight\.setup\.ts/,
    },
    {
      name: 'chromium-public',
      dependencies: ['preflight'],
      testMatch: /.*\.public\.spec\.ts/,
      use: devices['Desktop Chrome'],
    },
    {
      name: 'setup',
      dependencies: ['preflight'],
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium-authenticated',
      dependencies: ['setup'],
      testMatch: /.*\.authenticated\.spec\.ts/,
      testIgnore: /(?:onboarding|auth-destination)\.authenticated\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.clerk/user.json',
      },
    },
    {
      name: 'chromium-onboarding',
      dependencies: ['setup'],
      // These two files share a single resettable Clerk persona. Keep their
      // mutations ordered; other projects use distinct personas.
      fullyParallel: false,
      workers: 1,
      testMatch: /(?:onboarding|auth-destination)\.authenticated\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.clerk/user.json',
      },
    },
  ],
})
