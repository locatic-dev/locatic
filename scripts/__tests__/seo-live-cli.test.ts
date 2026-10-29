import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRIVATE_PATHS, renderRobotsTxt } from '../../src/lib/robots'

const ORIGIN = 'https://locatic.dev'
const originRobots = renderRobotsTxt(new URL(`${ORIGIN}/robots.txt`))
const managed = `# BEGIN Cloudflare Managed content
User-Agent: *
Content-signal: search=yes, ai-train=no
Allow: /

User-agent: GPTBot
Disallow: /
# END Cloudflare Managed Content
`

function check(body: string, mode = 'production', blockTraining = false) {
  const directory = mkdtempSync(join(tmpdir(), 'locatic-seo-check-'))
  try {
    const fixture = join(directory, 'fetch.mjs')
    writeFileSync(
      fixture,
      `
const robots = ${JSON.stringify(body)}
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input)
  if (url.origin !== '${ORIGIN}') return Response.redirect('${ORIGIN}/', 301)
  if (url.pathname === '/robots.txt') return new Response(robots)
  if (url.pathname === '/sitemap.xml') return new Response('<urlset>' + ['/', '/about', '/explore', '/privacy', '/terms'].map(path => '<url><loc>${ORIGIN}' + path + '</loc></url>').join('') + '</urlset>')
  if (${blockTraining} && /GPTBot|ClaudeBot|Google-Extended|CCBot/.test(init.headers?.['user-agent'] ?? '')) return new Response('', { status: 403 })
  const types = url.pathname === '/' ? ['Organization', 'WebSite'] : ['Organization', 'AboutPage', 'FAQPage']
  return new Response('<link rel="canonical" href="${ORIGIN}' + url.pathname + '"/><h1>Locatic</h1><script type="application/ld+json">' + JSON.stringify({'@graph': types.map(type => ({'@type': type}))}) + '</script>', { headers: ${JSON.stringify(mode === 'staging' ? { 'x-robots-tag': 'noindex' } : {})} })
}
`,
    )
    try {
      return {
        ok: true,
        output: execFileSync(
          process.execPath,
          [
            '--import',
            fixture,
            resolve('scripts/check-seo-live.mjs'),
            ORIGIN,
            mode,
          ],
          { encoding: 'utf8', stdio: 'pipe' },
        ),
      }
    } catch (error) {
      const result = error as { stdout: string; stderr: string }
      return { ok: false, output: `${result.stdout}${result.stderr}` }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('live SEO robots policy', () => {
  it.each([
    originRobots,
    managed + originRobots,
    (managed + originRobots)
      .replaceAll('\n', '\r\n')
      .replaceAll('User-agent:', 'USER-AGENT:'),
  ])('accepts consistent origin and managed policies', (body) => {
    expect(check(body)).toMatchObject({ ok: true })
  })

  it('permits edge blocking for training crawlers', () => {
    expect(check(managed + originRobots, 'production', true)).toMatchObject({
      ok: true,
    })
  })

  it('accepts the exact nonproduction block-all policy', () => {
    expect(check('User-agent: *\nDisallow: /\n', 'staging')).toMatchObject({
      ok: true,
    })
  })

  it.each([
    `${originRobots}Allow: /home\n`,
    managed.replace('Allow: /', 'Allow: /home') + originRobots,
    originRobots.replace('ai-train=no', 'ai-train=yes'),
    managed.replace('ai-train=no', 'ai-train=yes') + originRobots,
    originRobots.replace(', ai-train=no', ''),
    managed.replace('search=yes', 'search=no') + originRobots,
    originRobots.replace('ai-input=yes', 'ai-input=no'),
    originRobots.replace('User-agent: *', 'User-agent: Googlebot'),
    `${originRobots}\nUser-agent: *\nAllow: /\n`,
    managed.replace('# END Cloudflare Managed Content', '') + originRobots,
    managed.replace('Allow: /', 'Disallow: /') + originRobots,
    originRobots.replace('Disallow: /home', 'Disallow: /'),
    ...PRIVATE_PATHS.map((path) =>
      originRobots.replace(`Disallow: ${path}\n`, ''),
    ),
  ])('rejects missing, conflicting or weakened policy', (body) => {
    expect(check(body)).toMatchObject({ ok: false })
  })
})
