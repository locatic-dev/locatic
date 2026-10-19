import type { APIRequestContext } from '@playwright/test'
import { personas } from './fixtures/personas'
import { expect, requireE2EPrerequisite, test } from './fixtures/test'

/**
 * What crawlers read without running JavaScript: pages render at their
 * canonical URL, and server HTML carries the internal links and structured
 * data each page type promises. Persona requirement (fixtures.md): the
 * populated user's public profile, with at least one visible project.
 */

const PROFILE_USERNAME = personas.publicProfileUsername

function requireProfile() {
  requireE2EPrerequisite(
    Boolean(PROFILE_USERNAME),
    'set E2E_PUBLIC_PROFILE_USERNAME to a public profile with visible work (see playwright/fixtures/fixtures.md)',
  )
}

/** The `@type`s of every JSON-LD node in `html`. */
function jsonLdTypes(html: string): string[] {
  return [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ].flatMap((match) => {
    const data = JSON.parse(match[1]!) as {
      '@type'?: string
      '@graph'?: Array<{ '@type': string }>
    }
    return data['@graph']?.map((node) => node['@type']) ?? [data['@type']!]
  })
}

async function serverHtml(request: APIRequestContext, path: string) {
  const response = await request.get(path, { maxRedirects: 0 })
  expect(response.status(), path).toBe(200)
  return await response.text()
}

/** The persona's first project path, from the profile's server HTML. */
async function firstProjectPath(request: APIRequestContext) {
  const html = await serverHtml(request, `/u/${PROFILE_USERNAME}`)
  const match = html.match(/href="(\/project\/[^/"]+\/[^/"?]+)"/)
  requireE2EPrerequisite(
    Boolean(match),
    'the public profile persona needs at least one visible project',
  )
  return match![1]
}

test.describe('server HTML for crawlers', () => {
  test('Explore renders at its canonical URL', async ({ request }) => {
    const html = await serverHtml(request, '/explore')
    expect(html).toContain(
      '<link rel="canonical" href="https://locatic.dev/explore"/>',
    )
  })

  test('a profile renders at its canonical URL', async ({ request }) => {
    requireProfile()
    const html = await serverHtml(request, `/u/${PROFILE_USERNAME}`)
    expect(html).toContain(
      `<link rel="canonical" href="https://locatic.dev/u/${PROFILE_USERNAME}"/>`,
    )
  })

  test('a project page links to its builder and city', async ({ request }) => {
    requireProfile()
    const html = await serverHtml(request, await firstProjectPath(request))
    expect(html).toContain(`href="/u/${PROFILE_USERNAME}"`)
    expect(html).toMatch(/href="\/c\/[a-z0-9-]+"/)
  })

  for (const path of ['/explore', '/explore?mode=builders']) {
    test(`${path} lists public work in server HTML`, async ({ request }) => {
      const html = await serverHtml(request, path)
      expect(html).toMatch(/href="\/(project|u)\/[^"]+"/)
    })
  }

  test('the landing and about pages describe Locatic as structured data', async ({
    request,
  }) => {
    expect(jsonLdTypes(await serverHtml(request, '/'))).toEqual([
      'Organization',
      'WebSite',
    ])
    const about = await serverHtml(request, '/about')
    expect(jsonLdTypes(about)).toEqual(['Organization', 'AboutPage', 'FAQPage'])
    expect(about).toContain('<h1')
  })

  test('profiles and projects carry their structured data', async ({
    request,
  }) => {
    requireProfile()
    expect(
      jsonLdTypes(await serverHtml(request, `/u/${PROFILE_USERNAME}`)),
    ).toEqual(['ProfilePage'])
    expect(
      jsonLdTypes(await serverHtml(request, await firstProjectPath(request))),
    ).toEqual(['SoftwareSourceCode', 'BreadcrumbList'])
  })

  test('llms.txt introduces Locatic for agents', async ({ request }) => {
    const response = await request.get('/llms.txt')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('text/plain')
    const body = await response.text()
    expect(body).toMatch(/^# Locatic\n/)
    expect(body).toContain('https://locatic.dev/about')
  })
})
