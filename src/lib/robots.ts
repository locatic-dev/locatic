// robots.txt, served by src/routes/robots[.]txt.ts rather than public/,
// because static files are served before the Worker runs and can't vary by
// host.

import { SITE_URL } from '@/lib/seo'
import { isProductionHost } from '@/lib/security-headers'

import { PRIVATE_PATHS } from '@/lib/robots-policy'

export { PRIVATE_PATHS } from '@/lib/robots-policy'

/**
 * robots.txt for the requesting host. Production permits public search and
 * AI retrieval while declining training use through Content-Signal. One
 * origin `*` group keeps the private-path rules shared by every crawler.
 * Every other host blocks everything. Content-Signal:
 * https://contentsignals.org
 */
export function renderRobotsTxt(url: URL): string {
  if (!isProductionHost(url)) {
    return 'User-agent: *\nDisallow: /\n'
  }
  return [
    '# https://www.robotstxt.org/robotstxt.html',
    'User-agent: *',
    'Content-Signal: search=yes, ai-input=yes, ai-train=no',
    ...PRIVATE_PATHS.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n')
}
