// robots.txt, served by src/routes/robots[.]txt.ts rather than public/,
// because static files are served before the Worker runs and can't vary by
// host.

import { SITE_URL } from '@/lib/seo'
import { isProductionHost } from '@/lib/security-headers'

/** Signed-in, auth and admin paths: nothing a search result should show. */
export const PRIVATE_PATHS = [
  '/home',
  '/inbox',
  '/notifications',
  '/saved',
  '/settings',
  '/profile',
  '/onboarding',
  '/admin',
  '/sign-in',
  '/sign-up',
] as const

/**
 * robots.txt for the requesting host. Production opens public pages to every
 * crawler (search, AI search, user fetchers and AI training) with a single
 * `*` group: a named group would replace the private-path rules for that
 * agent. Every other host blocks everything. Content-Signal:
 * https://contentsignals.org
 */
export function renderRobotsTxt(url: URL): string {
  if (!isProductionHost(url)) {
    return 'User-agent: *\nDisallow: /\n'
  }
  return [
    '# https://www.robotstxt.org/robotstxt.html',
    'User-agent: *',
    'Content-Signal: search=yes, ai-input=yes, ai-train=yes',
    ...PRIVATE_PATHS.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n')
}
