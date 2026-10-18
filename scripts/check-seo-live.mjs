#!/usr/bin/env node

// Checks what crawlers see on a deployed Locatic: every sitemap URL renders
// at its own canonical URL with one h1, structured data is present, robots
// and indexing headers match the environment, and search and AI crawlers
// are not blocked by user agent.
//
//   pnpm seo:check https://locatic.dev production
//   pnpm seo:check https://development.locatic.dev staging
//
// Staging serves the production sitemap (its URLs name https://locatic.dev),
// so they are rewritten to the staging origin before they are fetched.
// Spoofed user agents only prove the WAF does not block by user agent; real
// crawler traffic is confirmed in Cloudflare AI Crawl Control.

const PRODUCTION_ORIGIN = 'https://locatic.dev'
const SITEMAP_URL_LIMIT = 200
const CONCURRENCY = 6

const CRAWLER_USER_AGENTS = {
  Googlebot:
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  bingbot:
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  'OAI-SearchBot':
    'Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)',
  'ChatGPT-User':
    'Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)',
  GPTBot: 'Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)',
  'Claude-SearchBot':
    'Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +claude-searchbot@anthropic.com)',
  'Claude-User':
    'Mozilla/5.0 (compatible; Claude-User/1.0; +Claude-User@anthropic.com)',
  ClaudeBot:
    'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  PerplexityBot:
    'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  'Google-Extended':
    'Mozilla/5.0 (compatible; Google-Extended/1.0; +http://www.google.com/bot.html)',
  CCBot: 'CCBot/2.0 (https://commoncrawl.org/faq/)',
}

// Pages that must render whatever the sitemap says; also the static entries
// every sitemap lists (src/lib/sitemap.ts STATIC_SITEMAP_PATHS).
const CORE_PAGES = ['/', '/about', '/explore', '/privacy', '/terms']

const STRUCTURED_DATA_PAGES = {
  '/': ['Organization', 'WebSite'],
  '/about': ['Organization', 'AboutPage', 'FAQPage'],
}

const [baseArg, mode] = process.argv.slice(2)
if (!baseArg || !['production', 'staging'].includes(mode)) {
  console.error(
    'usage: node scripts/check-seo-live.mjs <base-url> <production|staging>',
  )
  process.exit(2)
}
const origin = new URL(baseArg).origin
const production = mode === 'production'
const problems = []

function problem(message) {
  problems.push(message)
}

async function get(url, init = {}) {
  return fetch(url, { redirect: 'manual', ...init })
}

function canonicalOf(html) {
  return html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? null
}

function jsonLdTypes(html) {
  return [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ].flatMap((match) => {
    try {
      const data = JSON.parse(match[1])
      return data['@graph']?.map((node) => node['@type']) ?? [data['@type']]
    } catch {
      return ['(invalid JSON)']
    }
  })
}

async function inBatches(items, worker) {
  for (let index = 0; index < items.length; index += CONCURRENCY) {
    await Promise.all(items.slice(index, index + CONCURRENCY).map(worker))
  }
}

async function checkRobots() {
  const response = await get(`${origin}/robots.txt`)
  const body = await response.text()
  if (response.status !== 200) {
    problem(`robots.txt: status ${response.status}`)
  } else if (production) {
    if (!body.includes(`Sitemap: ${PRODUCTION_ORIGIN}/sitemap.xml`)) {
      problem('robots.txt: no sitemap line')
    }
    if (/^Disallow: \/$/m.test(body)) {
      problem('robots.txt: production blocks everything')
    }
    if ((body.match(/^User-agent:/gm) ?? []).length !== 1) {
      problem('robots.txt: expected one User-agent group')
    }
  } else if (body !== 'User-agent: *\nDisallow: /\n') {
    problem('robots.txt: staging must disallow everything')
  }
}

async function checkIndexingHeader() {
  const response = await get(`${origin}/`)
  const robotsHeader = response.headers.get('x-robots-tag')
  if (production && robotsHeader) {
    problem(`X-Robots-Tag in production: ${robotsHeader}`)
  }
  if (!production && !robotsHeader?.includes('noindex')) {
    problem('staging is missing X-Robots-Tag: noindex')
  }
}

async function checkHostRedirects() {
  if (!production) return
  for (const variant of [
    'http://locatic.dev/',
    'https://www.locatic.dev/',
    'http://www.locatic.dev/',
  ]) {
    try {
      const response = await get(variant)
      const location = response.headers.get('location')
      if (response.status !== 301 || location !== `${PRODUCTION_ORIGIN}/`) {
        problem(
          `${variant}: expected 301 to ${PRODUCTION_ORIGIN}/, got ${response.status} ${location ?? ''}`,
        )
      }
    } catch (error) {
      problem(`${variant}: ${error.message}`)
    }
  }
}

async function sitemapUrls() {
  const response = await get(`${origin}/sitemap.xml`)
  if (response.status !== 200) {
    problem(`sitemap.xml: status ${response.status}`)
    return []
  }
  const xml = await response.text()
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => match[1],
  )
  const listed = new Set(urls.map((url) => new URL(url).pathname))
  for (const path of CORE_PAGES) {
    if (!listed.has(path)) problem(`sitemap.xml: does not list ${path}`)
  }
  return urls.slice(0, SITEMAP_URL_LIMIT)
}

/** The core pages render at their own URL even if the sitemap is broken. */
async function checkCorePages() {
  for (const path of CORE_PAGES) {
    const response = await get(`${origin}${path}`)
    if (response.status !== 200) {
      problem(
        `${path}: status ${response.status}${response.headers.get('location') ? ` → ${response.headers.get('location')}` : ''}`,
      )
    }
  }
}

async function checkSitemapPage(listedUrl) {
  const path = new URL(listedUrl).pathname
  const response = await get(`${origin}${path}`)
  if (response.status !== 200) {
    problem(
      `${path}: status ${response.status}${response.headers.get('location') ? ` → ${response.headers.get('location')}` : ''}`,
    )
    return
  }
  const html = await response.text()
  const canonical = canonicalOf(html)
  if (canonical !== `${PRODUCTION_ORIGIN}${path}`) {
    problem(`${path}: canonical is ${canonical ?? 'missing'}`)
  }
  const h1Count = (html.match(/<h1[\s>]/g) ?? []).length
  if (h1Count !== 1) {
    problem(`${path}: ${h1Count} h1 elements`)
  }
  if (/<meta name="robots" content="noindex/.test(html)) {
    problem(`${path}: listed in the sitemap but noindex`)
  }
}

async function checkStructuredData() {
  for (const [path, expected] of Object.entries(STRUCTURED_DATA_PAGES)) {
    const response = await get(`${origin}${path}`)
    if (response.status !== 200) {
      problem(`${path}: status ${response.status}, structured data unchecked`)
      continue
    }
    const types = jsonLdTypes(await response.text())
    for (const type of expected) {
      if (!types.includes(type)) {
        problem(
          `${path}: JSON-LD is missing ${type} (found ${types.join(', ') || 'none'})`,
        )
      }
    }
  }
}

async function checkCrawlerAccess(cityPath) {
  for (const [name, userAgent] of Object.entries(CRAWLER_USER_AGENTS)) {
    for (const path of ['/', cityPath].filter(Boolean)) {
      const response = await get(`${origin}${path}`, {
        headers: { 'user-agent': userAgent },
      })
      if (response.status !== 200) {
        problem(`${name} gets ${response.status} on ${path}`)
      }
    }
  }
}

await checkRobots()
await checkIndexingHeader()
await checkHostRedirects()
await checkCorePages()
const urls = await sitemapUrls()
await inBatches(urls, checkSitemapPage)
await checkStructuredData()
await checkCrawlerAccess(
  urls
    .map((url) => new URL(url).pathname)
    .find((path) => path.startsWith('/c/')),
)

console.log(
  `checked ${origin} (${mode}): ${urls.length} sitemap URLs, ${Object.keys(CRAWLER_USER_AGENTS).length} crawler user agents`,
)
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`)
  for (const message of problems) console.error(`- ${message}`)
  process.exit(1)
}
console.log('no problems found')
