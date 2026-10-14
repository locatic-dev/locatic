// Response headers added to every SSR and server-route response by the
// request middleware in src/start.ts. Static files in public/ get theirs from
// public/_headers.

import { SITE_URL } from '@/lib/seo'

const PRODUCTION_HOST = new URL(SITE_URL).host

/**
 * Sources the page loads from: Clerk (frontend API, avatars, Cloudflare
 * bot-protection challenge, abuse and fraud protection on *.protect.clerk.com),
 * Convex (HTTP and WebSocket), Cloudflare Web Analytics, and GitHub avatars and
 * README images. Clerk's requirements:
 * https://clerk.com/docs/guides/secure/best-practices/csp-headers
 */
export const CSP_DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    "'unsafe-inline'",
    'https://*.clerk.accounts.dev',
    'https://clerk.locatic.dev',
    'https://challenges.cloudflare.com',
    'https://*.protect.clerk.com',
    'https://static.cloudflareinsights.com',
  ],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': [
    "'self'",
    'data:',
    'blob:',
    'https://*.githubusercontent.com',
    'https://img.clerk.com',
  ],
  'font-src': ["'self'"],
  'connect-src': [
    "'self'",
    'https://*.convex.cloud',
    'wss://*.convex.cloud',
    'https://*.clerk.accounts.dev',
    'https://clerk.locatic.dev',
    'https://*.protect.clerk.com:*',
    'https://cloudflareinsights.com',
  ],
  'frame-src': [
    'https://challenges.cloudflare.com',
    'https://*.protect.clerk.com',
  ],
  'worker-src': ["'self'", 'blob:'],
  'frame-ancestors': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'object-src': ["'none'"],
}

const CONTENT_SECURITY_POLICY = Object.entries(CSP_DIRECTIVES)
  .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
  .join('; ')

/**
 * HSTS is sent only for the production host over HTTPS: browsers ignore it on
 * plain HTTP, and preview and development hosts should not be pinned. The
 * policy is report-only until the browser console shows no violations in
 * production; then rename the header to `Content-Security-Policy`.
 */
export function securityHeaders(url: URL): Record<string, string> {
  const hsts = url.protocol === 'https:' && url.host === PRODUCTION_HOST
  return {
    ...(hsts
      ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' }
      : {}),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy-Report-Only': CONTENT_SECURITY_POLICY,
  }
}
