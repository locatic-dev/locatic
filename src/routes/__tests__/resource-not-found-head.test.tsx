import {
  HeadContent,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Route as CityRoute } from '@/routes/c.$slug'
import { Route as ProfileRoute } from '@/routes/u.$username'
import { Route as ProjectRoute } from '@/routes/_app/project.$owner.$repo'
import { seo } from '@/lib/seo'

// Missing resources load through the real router, so each route's head runs
// with the router's own match state (the root's `matches` is a stale
// snapshot when a child's loader throws notFound).

type RouteOptions = {
  loader?: unknown
  head?: unknown
}

async function renderHead(
  path: string,
  url: string,
  options: RouteOptions,
  data: unknown,
) {
  const rootRoute = createRootRouteWithContext<{ queryClient: unknown }>()({
    head: () => ({ meta: seo({}).meta }),
    component: () => (
      <>
        <HeadContent />
        <Outlet />
      </>
    ),
  })
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path,
    loader: options.loader as never,
    head: options.head as never,
    notFoundComponent: () => <p>not found</p>,
    component: () => <p>page</p>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([route as never]),
    history: createMemoryHistory({ initialEntries: [url] }),
    context: {
      queryClient: {
        ensureQueryData: async () => data,
        prefetchQuery: async () => undefined,
      },
    },
    isServer: true,
  })
  await router.load()
  return renderToString(<RouterProvider router={router} />)
}

const routes = [
  { name: 'city', path: '/c/$slug', url: '/c/missing', route: CityRoute },
  {
    name: 'profile',
    path: '/u/$username',
    url: '/u/missing',
    route: ProfileRoute,
  },
  {
    name: 'project',
    path: '/project/$owner/$repo',
    url: '/project/missing/missing',
    route: ProjectRoute,
  },
]

describe('resource 404 head', () => {
  it.each(routes)(
    'marks a missing $name page not found and noindex',
    async ({ path, url, route }) => {
      const html = await renderHead(path, url, route.options, null)

      expect(html).toContain('<title>page not found · Locatic</title>')
      expect(html).toContain('content="noindex, nofollow"')
      expect(html).not.toContain('<title>Locatic · github with a map</title>')
    },
  )

  it('keeps a thin city out of the index but follows its links', async () => {
    const html = await renderHead(
      '/c/$slug',
      '/c/mysuru-in',
      CityRoute.options,
      {
        city: {
          cityId: 'city_mysuru',
          slug: 'mysuru-in',
          name: 'Mysuru',
          displayName: 'Mysuru, Karnataka, India',
          location: { lat: 12.3, lng: 76.6 },
        },
        stats: { builderCount: 2, projectCount: 1, lastActivityAt: null },
        recentWork: { projects: [], hasMore: false },
      },
    )

    expect(html).toContain('content="noindex, follow"')
    expect(html).not.toContain('rel="canonical"')
  })

  it('keeps the page head for a city that exists', async () => {
    const html = await renderHead(
      '/c/$slug',
      '/c/mysuru-in',
      CityRoute.options,
      {
        city: {
          cityId: 'city_mysuru',
          slug: 'mysuru-in',
          name: 'Mysuru',
          displayName: 'Mysuru, Karnataka, India',
          location: { lat: 12.3, lng: 76.6 },
        },
        stats: { builderCount: 3, projectCount: 1, lastActivityAt: null },
        recentWork: { projects: [], hasMore: false },
      },
    )

    expect(html).toContain(
      '<title>Developers and projects in Mysuru · Locatic</title>',
    )
    expect(html).toContain('https://locatic.dev/c/mysuru-in')
    expect(html).not.toContain('noindex')
  })
})
