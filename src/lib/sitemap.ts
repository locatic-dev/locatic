import { SITE_URL } from '@/lib/seo'

export type SitemapEntry = {
  /** Path from the site root, e.g. `/c/berlin`. */
  path: string
  /** Last change in epoch milliseconds, or null when unknown. */
  updatedAt: number | null
}

/** Public pages that are always listed, ahead of the data-driven ones. */
export const STATIC_SITEMAP_PATHS = [
  '/',
  '/about',
  '/explore',
  '/privacy',
  '/terms',
]

/** One page of entries from a paginated `convex/sitemap.ts` query. */
type SitemapPage = {
  entries: SitemapEntry[]
  continueCursor: string
  isDone: boolean
}

/**
 * Pages each listing reads, at most. With 200 rows a page this caps a listing
 * at 10,000 rows, well inside the sitemaps.org limit of 50,000 URLs.
 */
const SITEMAP_MAX_PAGES = 50

/**
 * Reads `fetchPage` until the listing is done or `maxPages` is reached.
 * Hitting the cap or a failed page keeps the entries read so far and reports
 * `complete: false`.
 */
export async function collectSitemapPages(
  fetchPage: (cursor: string | null) => Promise<SitemapPage>,
  maxPages = SITEMAP_MAX_PAGES,
): Promise<{ entries: SitemapEntry[]; complete: boolean }> {
  const entries: SitemapEntry[] = []
  let cursor: string | null = null
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    let page: SitemapPage
    try {
      page = await fetchPage(cursor)
    } catch (error) {
      console.error('sitemap: could not load a page', error)
      return { entries, complete: false }
    }
    entries.push(...page.entries)
    if (page.isDone) {
      return { entries, complete: true }
    }
    cursor = page.continueCursor
  }
  return { entries, complete: false }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** A sitemaps.org `<urlset>` for `entries`, deduplicated by path. */
export function renderSitemap(entries: ReadonlyArray<SitemapEntry>): string {
  const seen = new Set<string>()
  const urls: string[] = []
  for (const entry of entries) {
    if (seen.has(entry.path)) {
      continue
    }
    seen.add(entry.path)
    const loc = `<loc>${escapeXml(`${SITE_URL}${encodeURI(entry.path)}`)}</loc>`
    const lastmod =
      entry.updatedAt === null
        ? ''
        : `<lastmod>${new Date(entry.updatedAt).toISOString().slice(0, 10)}</lastmod>`
    urls.push(`<url>${loc}${lastmod}</url>`)
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
}
