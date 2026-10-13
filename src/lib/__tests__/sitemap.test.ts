import { describe, expect, it, vi } from 'vitest'
import { collectSitemapPages, renderSitemap } from '../sitemap'

describe('renderSitemap', () => {
  it('renders absolute URLs with an optional lastmod date', () => {
    const xml = renderSitemap([
      { path: '/', updatedAt: null },
      { path: '/c/berlin-de', updatedAt: Date.UTC(2026, 9, 1, 15) },
    ])
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    )
    expect(xml).toContain('<url><loc>https://locatic.dev/</loc></url>')
    expect(xml).toContain(
      '<url><loc>https://locatic.dev/c/berlin-de</loc><lastmod>2026-10-01</lastmod></url>',
    )
  })

  it('escapes and encodes paths, and drops duplicates', () => {
    const xml = renderSitemap([
      { path: '/project/a&b/repo name', updatedAt: null },
      { path: '/project/a&b/repo name', updatedAt: null },
    ])
    expect(xml).toContain(
      '<loc>https://locatic.dev/project/a&amp;b/repo%20name</loc>',
    )
    expect(xml.match(/<url>/g)).toHaveLength(1)
  })
})

describe('collectSitemapPages', () => {
  const entry = (path: string) => ({ path, updatedAt: null })

  it('follows cursors until the listing is done', async () => {
    const fetchPage = vi.fn(async (cursor: string | null) =>
      cursor === null
        ? { entries: [entry('/a')], continueCursor: 'next', isDone: false }
        : { entries: [entry('/b')], continueCursor: 'end', isDone: true },
    )
    await expect(collectSitemapPages(fetchPage)).resolves.toEqual({
      entries: [entry('/a'), entry('/b')],
      complete: true,
    })
    expect(fetchPage).toHaveBeenNthCalledWith(2, 'next')
  })

  it('stops at the page cap and reports the listing incomplete', async () => {
    const fetchPage = vi.fn(async () => ({
      entries: [entry('/a')],
      continueCursor: 'more',
      isDone: false,
    }))
    const result = await collectSitemapPages(fetchPage, 3)
    expect(fetchPage).toHaveBeenCalledTimes(3)
    expect(result.entries).toHaveLength(3)
    expect(result.complete).toBe(false)
  })

  it('keeps earlier pages and reports a failed page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        entries: [entry('/a')],
        continueCursor: 'next',
        isDone: false,
      })
      .mockRejectedValueOnce(new Error('read limit'))
    await expect(collectSitemapPages(fetchPage)).resolves.toEqual({
      entries: [entry('/a')],
      complete: false,
    })
  })
})
