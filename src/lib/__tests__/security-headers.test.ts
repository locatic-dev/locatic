import { describe, expect, it } from 'vitest'
import { CSP_DIRECTIVES, securityHeaders } from '../security-headers'

function headersFor(url: string) {
  return securityHeaders(new URL(url))
}

function cspDirective(name: string): string[] {
  const csp = headersFor('https://locatic.dev/')[
    'Content-Security-Policy-Report-Only'
  ]
  const directive = csp
    .split('; ')
    .map((part) => part.split(' '))
    .find(([directiveName]) => directiveName === name)
  return directive ? directive.slice(1) : []
}

describe('securityHeaders', () => {
  it('sends HSTS only for the production host over HTTPS', () => {
    expect(headersFor('https://locatic.dev/explore')).toHaveProperty(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    )
    for (const url of [
      'http://localhost:3000/',
      'https://locatic-dev.example.workers.dev/',
      'http://locatic.dev/',
    ]) {
      expect(headersFor(url)).not.toHaveProperty('Strict-Transport-Security')
    }
  })

  it('marks non-production hosts noindex', () => {
    for (const url of [
      'https://development.locatic.dev/',
      'https://locatic.example.workers.dev/',
      'http://localhost:3000/',
      'http://locatic.dev/',
    ]) {
      expect(headersFor(url)['X-Robots-Tag']).toBe('noindex, nofollow')
    }
  })

  it('lets the production host be indexed', () => {
    expect(headersFor('https://locatic.dev/')).not.toHaveProperty(
      'X-Robots-Tag',
    )
  })

  it('blocks framing, sniffing and unused device APIs', () => {
    const headers = headersFor('https://locatic.dev/')
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Permissions-Policy']).toContain('camera=()')
    expect(cspDirective('frame-ancestors')).toEqual(["'none'"])
  })

  it('serializes every directive into the policy', () => {
    for (const [name, sources] of Object.entries(CSP_DIRECTIVES)) {
      expect(cspDirective(name)).toEqual(sources)
    }
  })

  it('allows Clerk, Convex, analytics and GitHub in the right directives', () => {
    expect(cspDirective('script-src')).toEqual(
      expect.arrayContaining([
        'https://clerk.locatic.dev',
        'https://challenges.cloudflare.com',
        'https://*.protect.clerk.com',
        'https://static.cloudflareinsights.com',
      ]),
    )
    expect(cspDirective('connect-src')).toEqual(
      expect.arrayContaining([
        'https://*.convex.cloud',
        'wss://*.convex.cloud',
        'https://clerk.locatic.dev',
        'https://*.protect.clerk.com:*',
        'https://cloudflareinsights.com',
      ]),
    )
    expect(cspDirective('frame-src')).toEqual(
      expect.arrayContaining([
        'https://challenges.cloudflare.com',
        'https://*.protect.clerk.com',
      ]),
    )
    expect(cspDirective('img-src')).toEqual(
      expect.arrayContaining([
        'https://*.githubusercontent.com',
        'https://img.clerk.com',
      ]),
    )
    expect(cspDirective('style-src')).toContain("'unsafe-inline'")
    expect(cspDirective('worker-src')).toEqual(["'self'", 'blob:'])
  })
})
