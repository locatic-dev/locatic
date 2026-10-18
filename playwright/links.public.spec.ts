import { expect, test } from './fixtures/test'

/**
 * Launch checks for what crawlers and link previews read: every same-origin
 * link on the public pages resolves, and the sitemap, robots.txt and the
 * social preview image are served.
 */

const PUBLIC_PAGES = ['/', '/about', '/explore', '/privacy', '/terms']

test.describe('public links and crawler files', () => {
  test('every same-origin link on the public pages resolves', async ({
    page,
    request,
    baseURL,
  }) => {
    const origin = new URL(baseURL!).origin
    const hrefs = new Set<string>()

    for (const path of PUBLIC_PAGES) {
      await page.goto(path)
      await expect(page.locator('main#main-content')).toBeVisible()
      const pageHrefs = await page
        .locator('a[href]')
        .evaluateAll((anchors) =>
          anchors.map((anchor) => (anchor as HTMLAnchorElement).href),
        )
      for (const href of pageHrefs) {
        const url = new URL(href)
        if (url.origin === origin) {
          url.hash = ''
          hrefs.add(url.toString())
        }
      }
    }

    expect(hrefs.size).toBeGreaterThan(0)
    const broken: string[] = []
    for (const href of hrefs) {
      // Signed-in routes redirect a visitor to sign-in (3xx is followed).
      const response = await request.get(href)
      if (response.status() >= 400) {
        broken.push(`${response.status()} ${href}`)
      }
    }
    expect(broken).toEqual([])
  })

  test('serves the sitemap with the public pages', async ({ request }) => {
    const response = await request.get('/sitemap.xml')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('application/xml')
    const xml = await response.text()
    for (const path of PUBLIC_PAGES) {
      expect(xml).toContain(`<loc>https://locatic.dev${path}</loc>`)
    }
  })

  test('robots.txt opens production and closes every other host', async ({
    request,
    baseURL,
  }) => {
    const response = await request.get('/robots.txt')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('text/plain')
    const robots = await response.text()
    if (new URL(baseURL!).origin === 'https://locatic.dev') {
      expect(robots).toContain('Sitemap: https://locatic.dev/sitemap.xml')
      expect(robots).toContain('Disallow: /settings')
    } else {
      expect(robots).toBe('User-agent: *\nDisallow: /\n')
    }
  })

  test('declares a social preview image that is served', async ({
    page,
    request,
  }) => {
    await page.goto('/')
    const image = await page
      .locator('meta[property="og:image"]')
      .getAttribute('content')
    expect(image).toBe('https://locatic.dev/og-image.png')
    // Served from this deployment's public/ directory.
    const response = await request.get(new URL(image!).pathname)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('image/png')
  })
})
