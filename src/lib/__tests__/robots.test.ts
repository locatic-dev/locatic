import { describe, expect, it } from 'vitest'
import { PRIVATE_PATHS, renderRobotsTxt } from '../robots'

describe('renderRobotsTxt', () => {
  it('blocks every crawler on non-production hosts', () => {
    for (const href of [
      'https://development.locatic.dev/robots.txt',
      'http://localhost:3000/robots.txt',
      'http://locatic.dev/robots.txt',
    ]) {
      expect(renderRobotsTxt(new URL(href))).toBe(
        'User-agent: *\nDisallow: /\n',
      )
    }
  })

  it('opens public pages in production and keeps private paths out', () => {
    const body = renderRobotsTxt(new URL('https://locatic.dev/robots.txt'))
    expect(body).toContain('User-agent: *\n')
    expect(body).toContain(
      'Content-Signal: search=yes, ai-input=yes, ai-train=yes\n',
    )
    for (const path of PRIVATE_PATHS) {
      expect(body).toContain(`Disallow: ${path}\n`)
    }
    expect(body).not.toContain('Disallow: /\n')
    expect(body).toContain('Sitemap: https://locatic.dev/sitemap.xml\n')
    // One group for every agent: a named group would replace these rules.
    expect(body.match(/User-agent:/g)).toHaveLength(1)
  })
})
