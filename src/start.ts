import { clerkMiddleware } from '@clerk/tanstack-react-start/server'
import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from '@tanstack/react-start'
import { securityHeaders } from '@/lib/security-headers'

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

/**
 * Adds src/lib/security-headers.ts to every response. Redirects built with
 * `Response.redirect()` have immutable headers, so the response is copied.
 */
const securityHeadersMiddleware = createMiddleware().server(
  async ({ request, next }) => {
    const result = await next()
    const response = new Response(result.response.body, result.response)
    const headers = securityHeaders(new URL(request.url))
    for (const [name, value] of Object.entries(headers)) {
      if (!response.headers.has(name)) {
        response.headers.set(name, value)
      }
    }
    return { ...result, response }
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [
    securityHeadersMiddleware,
    csrfMiddleware,
    clerkMiddleware(),
  ],
}))
