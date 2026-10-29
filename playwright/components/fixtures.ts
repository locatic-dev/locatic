import { expect, test as base } from '@playwright/test'

// All component fixtures use production UI with local memory adapters.
// Fail on unexpected external dependencies, including attempted requests.
export const test = base.extend<{ localBoundary: void }>({
  localBoundary: [
    async ({ page, baseURL }, use) => {
      const errors: string[] = []
      const externalRequests: string[] = []
      const origin = new URL(baseURL!).origin
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      await page.route('**/*', (route) => {
        const url = new URL(route.request().url())
        if (url.origin === origin) return route.continue()
        externalRequests.push(url.origin)
        return route.abort('blockedbyclient')
      })
      await use()
      expect(externalRequests).toEqual([])
      expect(errors).toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
