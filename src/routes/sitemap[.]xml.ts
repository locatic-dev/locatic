import { createFileRoute } from '@tanstack/react-router'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'
import {
  STATIC_SITEMAP_PATHS,
  collectSitemapPages,
  renderSitemap,
} from '@/lib/sitemap'
import type { SitemapEntry } from '@/lib/sitemap'

const PAGE_SIZE = 200

/**
 * /sitemap.xml: the static public pages plus the cities, projects and public
 * profiles from `convex/sitemap.ts`, read page by page. If any listing fails
 * the entries read so far are still served, with a short cache so the full
 * list returns soon.
 */
export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const client = new ConvexHttpClient(import.meta.env.VITE_CONVEX_URL)
        const entries: SitemapEntry[] = STATIC_SITEMAP_PATHS.map((path) => ({
          path,
          updatedAt: null,
        }))
        let complete = true

        try {
          entries.push(...(await client.query(api.sitemap.cities, {})))
        } catch (error) {
          console.error('sitemap: could not load cities', error)
          complete = false
        }

        for (const listing of [api.sitemap.projects, api.sitemap.profiles]) {
          const result = await collectSitemapPages((cursor) =>
            client.query(listing, {
              paginationOpts: { numItems: PAGE_SIZE, cursor },
            }),
          )
          entries.push(...result.entries)
          complete &&= result.complete
        }

        return new Response(renderSitemap(entries), {
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': `public, max-age=${complete ? 3600 : 300}`,
          },
        })
      },
    },
  },
})
